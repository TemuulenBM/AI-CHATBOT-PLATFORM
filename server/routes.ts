import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import chatbotRoutes from "./routes/chatbots";
import chatRoutes from "./routes/chat";
import subscriptionRoutes from "./routes/subscriptions";
import widgetRoutes from "./routes/widget";
import widgetAnalyticsRoutes from "./routes/widget-analytics";
import * as feedbackController from "./controllers/feedback";
import * as chatbotsController from "./controllers/chatbots";
import { clerkAuthMiddleware as authMiddleware, loadSubscription } from "./middleware/clerkAuth";
import { handleClerkWebhook } from "./middleware/clerkWebhook";
import { getCsrfToken, validateCsrfToken } from "./middleware/csrf";
import { AppError } from "./utils/errors";
import logger from "./utils/logger";
import { redis } from "./utils/redis";
import { supabaseAdmin } from "./utils/supabase";
import { scrapeQueue, embeddingQueue } from "./jobs/queues";
import {
  recordRequestMetrics,
  getMetricsSnapshot,
  getActiveAlerts,
  getAlertHistory,
  acknowledgeAlert,
  getUptimeStatus,
  getSlowQueryReport,
  initializeMonitoring,
  registerUptimeCheck,
  reportCriticalError,
} from "./utils/monitoring";

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
  // Initialize production monitoring
  initializeMonitoring();

  // Register uptime checks for critical services
  registerUptimeCheck("database", async () => {
    const { error } = await supabaseAdmin.from("users").select("id").limit(1);
    return !error;
  }, 60000); // Check every 60 seconds

  registerUptimeCheck("redis", async () => {
    try {
      await redis.ping();
      return true;
    } catch {
      return false;
    }
  }, 30000); // Check every 30 seconds

  registerUptimeCheck("openai", async () => {
    if (!process.env.OPENAI_API_KEY) return true; // Skip if not configured
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }, 120000); // Check every 2 minutes

  // Request ID middleware - adds unique ID to each request for tracing
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.requestId = req.headers["x-request-id"] as string || randomUUID();
    res.setHeader("x-request-id", req.requestId);

    // Set Sentry context for this request
    if (process.env.SENTRY_DSN) {
      Sentry.setTag("request_id", req.requestId);
    }

    // Record request metrics on response finish
    const startTime = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      recordRequestMetrics(req.method, req.path, res.statusCode, duration);
    });

    next();
  });

  // CSRF token endpoint
  app.get("/api/csrf-token", getCsrfToken);

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

    // Check Paddle API
    const paddleStart = Date.now();
    try {
      if (process.env.PADDLE_API_KEY) {
        const paddleEnv = process.env.PADDLE_ENVIRONMENT || "sandbox";
        const paddleBase = paddleEnv === "live" 
          ? "https://api.paddle.com" 
          : "https://sandbox-api.paddle.com";
        const response = await fetch(`${paddleBase}/customers`, {
          method: "GET",
          headers: { 
            Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
            "Content-Type": "application/json",
          },
        });
        if (response.ok || response.status === 400) { // 400 might be valid if no query params
          checks.paddle = { status: "connected", latency: Date.now() - paddleStart };
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } else {
        checks.paddle = { status: "not_configured" };
      }
    } catch (err) {
      checks.paddle = { status: "error", latency: Date.now() - paddleStart, error: (err as Error).message };
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

  // ============================================
  // Monitoring & Observability Endpoints
  // ============================================

  // Metrics endpoint - returns collected metrics
  app.get("/api/monitoring/metrics", authMiddleware, async (_req: Request, res: Response) => {
    try {
      const metrics = getMetricsSnapshot();
      res.json({
        timestamp: new Date().toISOString(),
        ...metrics,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve metrics" });
    }
  });

  // Uptime status endpoint
  app.get("/api/monitoring/uptime", async (_req: Request, res: Response) => {
    try {
      const uptime = getUptimeStatus();
      res.json({
        timestamp: new Date().toISOString(),
        checks: uptime,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve uptime status" });
    }
  });

  // Active alerts endpoint
  app.get("/api/monitoring/alerts", authMiddleware, async (_req: Request, res: Response) => {
    try {
      const active = getActiveAlerts();
      res.json({
        timestamp: new Date().toISOString(),
        count: active.length,
        alerts: active,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve alerts" });
    }
  });

  // Alert history endpoint
  app.get("/api/monitoring/alerts/history", authMiddleware, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const history = getAlertHistory(limit);
      res.json({
        timestamp: new Date().toISOString(),
        count: history.length,
        alerts: history,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve alert history" });
    }
  });

  // Acknowledge alert endpoint
  app.post("/api/monitoring/alerts/:alertId/acknowledge", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { alertId } = req.params;
      const acknowledged = acknowledgeAlert(alertId);
      if (acknowledged) {
        res.json({ success: true, alertId });
      } else {
        res.status(404).json({ error: "Alert not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  });

  // Slow queries report endpoint
  app.get("/api/monitoring/slow-queries", authMiddleware, async (req: Request, res: Response) => {
    try {
      const threshold = parseInt(req.query.threshold as string) || 500;
      const slowQueries = getSlowQueryReport(threshold);
      res.json({
        timestamp: new Date().toISOString(),
        thresholdMs: threshold,
        count: slowQueries.length,
        queries: slowQueries,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve slow queries" });
    }
  });

  // Clerk Webhook (must be before JSON body parser for raw body)
  app.post("/api/webhooks/clerk", handleClerkWebhook);

  // Apply CSRF validation to all API routes that modify data
  // This middleware validates CSRF tokens for POST, PUT, PATCH, DELETE requests
  app.use("/api", validateCsrfToken);

  // API Routes
  app.use("/api/chatbots", chatbotRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.use("/api/analytics/widget", authMiddleware, widgetAnalyticsRoutes);

  // Widget routes (served at root level for easy embedding)
  app.use("/", widgetRoutes);

  // Feedback routes (public for widget access)
  app.post("/api/feedback", feedbackController.submitFeedback);
  app.get("/api/feedback/:conversationId", feedbackController.checkFeedback);
  app.get("/api/chatbots/:chatbotId/satisfaction", feedbackController.getSatisfactionMetrics);

  // Widget analytics tracking (public for widget access)
  app.post("/api/analytics/widget/track", chatbotsController.trackWidgetEvent);

  // Analytics comparison route (requires auth)
  app.get(
    "/api/analytics/compare",
    authMiddleware,
    loadSubscription,
    chatbotsController.compareChatbots
  );

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
