import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import authRoutes from "./routes/auth";
import chatbotRoutes from "./routes/chatbots";
import chatRoutes from "./routes/chat";
import subscriptionRoutes from "./routes/subscriptions";
import { AppError } from "./utils/errors";
import logger from "./utils/logger";
import { redis } from "./utils/redis";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Health check
  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      // Check Redis connection
      await redis.ping();
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        services: {
          redis: "connected"
        }
      });
    } catch (error) {
      res.status(503).json({
        status: "degraded",
        timestamp: new Date().toISOString(),
        services: {
          redis: "disconnected"
        }
      });
    }
  });

  // API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/chatbots", chatbotRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);

  // 404 handler for API routes
  app.use("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({ message: "Endpoint not found" });
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    // Log error
    logger.error("Request error", {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    // Handle known errors
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        message: err.message,
        code: err.code,
      });
      return;
    }

    // Handle validation errors from Zod
    if (err.name === "ZodError") {
      res.status(400).json({
        message: "Validation error",
        code: "VALIDATION_ERROR",
        details: err,
      });
      return;
    }

    // Handle JWT errors
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      res.status(401).json({
        message: "Invalid or expired token",
        code: "AUTHENTICATION_ERROR",
      });
      return;
    }

    // Generic error response
    res.status(500).json({
      message: process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
      code: "INTERNAL_ERROR",
    });
  });

  return httpServer;
}
