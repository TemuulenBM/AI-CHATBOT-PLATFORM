import "dotenv/config";
import * as Sentry from "@sentry/node";
import express from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { closeQueues, initScheduledRescrape } from "./jobs/queues";
import logger from "./utils/logger";
import { initializeEnvironment } from "./utils/env";
import { applySecurity } from "./middleware/security";

// Validate environment variables at startup
initializeEnvironment();

// Initialize Sentry for error tracking and APM
if (process.env.SENTRY_DSN) {
  // Get sample rates from environment or use defaults
  const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1");
  const profilesSampleRate = parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || "0.1");

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    release: process.env.npm_package_version,

    // APM Configuration
    tracesSampleRate: process.env.NODE_ENV === "production" ? tracesSampleRate : 1.0,
    profilesSampleRate: profilesSampleRate,

    // Enable automatic instrumentation
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      // Enable database query tracing if available
      Sentry.postgresIntegration(),
    ],

    // Configure what gets traced
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/[^/]*\.supabase\.co/,
      /^https:\/\/api\.openai\.com/,
      /^https:\/\/.*paddle\.com/,
    ],

    // Enhanced error filtering
    beforeSend(event, hint) {
      // Filter out non-critical errors in production
      if (process.env.NODE_ENV === "production") {
        const error = hint.originalException;
        if (error instanceof Error) {
          // Don't send 404 or validation errors to Sentry
          if (error.message.includes("not found") || error.name === "ZodError") {
            return null;
          }
          // Filter connection reset errors (common from load balancers)
          if ((error as NodeJS.ErrnoException).code === "ECONNRESET") {
            return null;
          }
        }
      }
      return event;
    },

    // Filter transactions for performance
    beforeSendTransaction(event) {
      // Don't send health check transactions to reduce noise
      if (event.transaction?.includes("/api/health")) {
        return null;
      }
      return event;
    },
  });

  logger.info("Sentry APM initialized", {
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? tracesSampleRate : 1.0,
    profilesSampleRate,
  });
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Apply security middleware BEFORE body parsers
applySecurity(app);

// Add size limits to prevent DoS
app.use(
  express.json({
    limit: process.env.BODY_LIMIT || "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({
  extended: false,
  limit: process.env.BODY_LIMIT || "10mb",
}));

export function log(message: string, source = "express") {
  logger.debug(message, { source });
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    // Skip serving static files if API_ONLY mode is enabled
    // (used when frontend is deployed separately on Vercel)
    if (process.env.API_ONLY !== "true") {
      serveStatic(app);
    } else {
      logger.info("API_ONLY mode enabled - not serving static files");
    }
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";
  
  // Handle socket-level errors to prevent ECONNRESET from flooding logs
  httpServer.on("connection", (socket) => {
    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNRESET" || err.code === "EPIPE" || err.code === "ETIMEDOUT") {
        // Silently ignore common connection issues from health checks/load balancers
        return;
      }
      logger.error("Socket error", { code: err.code, message: err.message });
    });
  });

  httpServer.listen(
    port,
    host,
    async () => {
      log(`serving on ${host}:${port}`);
      logger.info(`Server started on ${host}:${port}`);

      // Initialize scheduled re-scraping cron job
      try {
        await initScheduledRescrape();
      } catch (error) {
        logger.warn("Failed to initialize scheduled re-scrape (Redis may be unavailable)", { error });
      }
    },
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down gracefully...");

    httpServer.close(() => {
      logger.info("HTTP server closed");
    });

    await closeQueues();

    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Handle uncaught errors gracefully (e.g., ECONNRESET from Redis)
  process.on("uncaughtException", (error: NodeJS.ErrnoException) => {
    // Ignore ECONNRESET - these are typically harmless connection resets
    // from Redis/health checks and don't require app restart
    if (error.code === "ECONNRESET") {
      logger.debug("Connection reset (ECONNRESET) - ignoring", { message: error.message });
      return;
    }
    
    logger.error("Uncaught exception", { error: error.message, stack: error.stack });
    
    // For critical errors, exit after logging
    if (process.env.NODE_ENV === "production") {
      Sentry.captureException(error);
      // Give Sentry time to send the error
      setTimeout(() => process.exit(1), 1000);
    }
  });

  process.on("unhandledRejection", (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    
    // Ignore ECONNRESET in promise rejections too
    if ((error as NodeJS.ErrnoException).code === "ECONNRESET") {
      logger.debug("Connection reset in promise (ECONNRESET) - ignoring");
      return;
    }
    
    logger.error("Unhandled promise rejection", { error: error.message, stack: error.stack });
  });
})();
