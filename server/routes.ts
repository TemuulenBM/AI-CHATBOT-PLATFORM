import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import authRoutes from "./routes/auth";
import chatbotRoutes from "./routes/chatbots";
import chatRoutes from "./routes/chat";
import subscriptionRoutes from "./routes/subscriptions";
import widgetRoutes from "./routes/widget";
import * as feedbackController from "./controllers/feedback";
import { AppError } from "./utils/errors";
import logger from "./utils/logger";
import { redis } from "./utils/redis";
import { supabaseAdmin } from "./utils/supabase";
import { scrapeQueue, embeddingQueue } from "./jobs/queues";

// Extend Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Request ID middleware - adds unique ID to each request for tracing
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.requestId = req.headers["x-request-id"] as string || randomUUID();
    res.setHeader("x-request-id", req.requestId);

    // Set Sentry context for this request
    if (process.env.SENTRY_DSN) {
      Sentry.setTag("request_id", req.requestId);
    }

    next();
  });

  // Basic health check
  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      await redis.ping();
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        services: {
          redis: "connected"
        }
      });
    } catch {
      res.status(503).json({
        status: "degraded",
        timestamp: new Date().toISOString(),
        services: {
          redis: "disconnected"
        }
      });
    }
  });

  // Detailed health check endpoint
  app.get("/api/health/detailed", async (_req: Request, res: Response) => {
    const checks: Record<string, { status: string; latency?: number; error?: string; details?: unknown }> = {};
    let overallStatus = "ok";

    // Check Database (Supabase)
    const dbStart = Date.now();
    try {
      const { error } = await supabaseAdmin.from("users").select("id").limit(1);
      if (error) throw error;
      checks.database = { status: "connected", latency: Date.now() - dbStart };
    } catch (err) {
      checks.database = { status: "disconnected", latency: Date.now() - dbStart, error: (err as Error).message };
      overallStatus = "degraded";
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: "connected", latency: Date.now() - redisStart };
    } catch (err) {
      checks.redis = { status: "disconnected", latency: Date.now() - redisStart, error: (err as Error).message };
      overallStatus = "degraded";
    }

    // Check OpenAI API
    const openaiStart = Date.now();
    try {
      if (process.env.OPENAI_API_KEY) {
        const response = await fetch("https://api.openai.com/v1/models", {
          method: "GET",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        });
        if (response.ok) {
          checks.openai = { status: "connected", latency: Date.now() - openaiStart };
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } else {
        checks.openai = { status: "not_configured" };
      }
    } catch (err) {
      checks.openai = { status: "error", latency: Date.now() - openaiStart, error: (err as Error).message };
      // OpenAI being down is not critical for health
    }

    // Check Stripe API
    const stripeStart = Date.now();
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        const response = await fetch("https://api.stripe.com/v1/balance", {
          method: "GET",
          headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        });
        if (response.ok) {
          checks.stripe = { status: "connected", latency: Date.now() - stripeStart };
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } else {
        checks.stripe = { status: "not_configured" };
      }
    } catch (err) {
      checks.stripe = { status: "error", latency: Date.now() - stripeStart, error: (err as Error).message };
    }

    // Check Queue Status
    try {
      const [scrapeWaiting, scrapeActive, embeddingWaiting, embeddingActive] = await Promise.all([
        scrapeQueue.getWaitingCount(),
        scrapeQueue.getActiveCount(),
        embeddingQueue.getWaitingCount(),
        embeddingQueue.getActiveCount(),
      ]);

      checks.queues = {
        status: "ok",
        details: {
          scraping: { waiting: scrapeWaiting, active: scrapeActive },
          embedding: { waiting: embeddingWaiting, active: embeddingActive },
        },
      };
    } catch (err) {
      checks.queues = { status: "error", error: (err as Error).message };
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    checks.memory = {
      status: "ok",
      details: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      },
    };

    const statusCode = overallStatus === "ok" ? 200 : 503;
    res.status(statusCode).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: `${Math.round(process.uptime())}s`,
      version: process.env.npm_package_version || "unknown",
      environment: process.env.NODE_ENV || "development",
      services: checks,
    });
  });

  // API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/chatbots", chatbotRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);

  // Widget routes (served at root level for easy embedding)
  app.use("/", widgetRoutes);

  // Feedback routes (public for widget access)
  app.post("/api/feedback", feedbackController.submitFeedback);
  app.get("/api/feedback/:conversationId", feedbackController.checkFeedback);
  app.get("/api/chatbots/:chatbotId/satisfaction", feedbackController.getSatisfactionMetrics);

  // 404 handler for API routes
  app.use("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({ message: "Endpoint not found" });
  });

  // Sentry error handler (must be before custom error handler)
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  // Global error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    // Log error with request ID
    logger.error("Request error", {
      requestId: req.requestId,
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: (req as unknown as { user?: { userId: string } }).user?.userId,
    });

    // Handle known errors
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        message: err.message,
        code: err.code,
        requestId: req.requestId,
      });
      return;
    }

    // Handle validation errors from Zod
    if (err.name === "ZodError") {
      res.status(400).json({
        message: "Validation error",
        code: "VALIDATION_ERROR",
        details: err,
        requestId: req.requestId,
      });
      return;
    }

    // Handle JWT errors
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      res.status(401).json({
        message: "Invalid or expired token",
        code: "AUTHENTICATION_ERROR",
        requestId: req.requestId,
      });
      return;
    }

    // Generic error response
    res.status(500).json({
      message: process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
      code: "INTERNAL_ERROR",
      requestId: req.requestId,
    });
  });

  return httpServer;
}
