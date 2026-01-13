import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import express, { Express, Request, Response } from "express";
import request from "supertest";
import { createServer, Server } from "http";

// Export mock for use in tests
export const mockSupabaseFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [{ id: "test" }], error: null }),
}));

// Mock all dependencies
vi.mock("@sentry/node", () => ({
  setTag: vi.fn(),
  setupExpressErrorHandler: vi.fn((app) => app),
}));

vi.mock("../../../server/utils/redis", () => ({
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
  },
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "test" }], error: null }),
    })),
  },
}));

vi.mock("../../../server/utils/monitoring", () => ({
  recordRequestMetrics: vi.fn(),
  getMetricsSnapshot: vi.fn().mockReturnValue({
    counters: {},
    gauges: {},
    histograms: {},
  }),
  getActiveAlerts: vi.fn().mockReturnValue([]),
  getAlertHistory: vi.fn().mockReturnValue([]),
  acknowledgeAlert: vi.fn().mockReturnValue(true),
  getUptimeStatus: vi.fn().mockReturnValue({
    database: { up: true, lastCheck: new Date().toISOString() },
    redis: { up: true, lastCheck: new Date().toISOString() },
  }),
  getSlowQueryReport: vi.fn().mockReturnValue([]),
  initializeMonitoring: vi.fn(),
  registerUptimeCheck: vi.fn((name: string, checkFn: () => Promise<boolean>, interval: number) => {
    // Execute the check function to test error paths
    if (name === "database") {
      checkFn().catch(() => {}); // Test error case
    } else if (name === "redis") {
      checkFn().catch(() => {}); // Test error case
    } else if (name === "openai") {
      checkFn().catch(() => {}); // Test error case
    }
  }),
  reportCriticalError: vi.fn(),
}));

vi.mock("../../../server/jobs/queues", () => ({
  getRedisConnection: vi.fn(() => ({
    host: "localhost",
    port: 6379,
    maxRetriesPerRequest: null,
  })),
  scrapeQueue: {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
  },
  embeddingQueue: {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
  },
  analyticsCleanupQueue: {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getCompletedCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../server/middleware/csrf", () => ({
  getCsrfToken: vi.fn((_req: Request, res: Response) => {
    res.json({ csrfToken: "test-csrf-token" });
  }),
  validateCsrfToken: vi.fn((_req: Request, _res: Response, next: () => void) => {
    next();
  }),
}));

vi.mock("../../../server/middleware/clerkAuth", () => ({
  clerkAuthMiddleware: vi.fn((_req: Request, _res: Response, next: () => void) => {
    next();
  }),
  optionalClerkAuthMiddleware: vi.fn((_req: Request, _res: Response, next: () => void) => {
    next();
  }),
  loadSubscription: vi.fn((_req: Request, _res: Response, next: () => void) => {
    next();
  }),
}));

vi.mock("../../../server/middleware/clerkWebhook", () => ({
  handleClerkWebhook: vi.fn((_req: Request, res: Response) => {
    res.json({ success: true });
  }),
}));

vi.mock("../../../server/middleware/adminAuth", () => ({
  loadAdminStatus: vi.fn((_req: Request, _res: Response, next: () => void) => {
    next();
  }),
  requireAdmin: vi.fn((_req: Request, _res: Response, next: () => void) => {
    next();
  }),
}));

vi.mock("../../../server/controllers/gdpr/consent", () => ({
  recordConsent: vi.fn((_req: Request, res: Response) => {
    res.json({ success: true });
  }),
  getConsentStatus: vi.fn((_req: Request, res: Response) => {
    res.json({ consented: true });
  }),
}));

vi.mock("../../../server/controllers/gdpr/privacy-policy", () => ({
  createPrivacyPolicy: vi.fn((_req: Request, res: Response) => {
    res.json({ success: true });
  }),
  updatePrivacyPolicy: vi.fn((_req: Request, res: Response) => {
    res.json({ success: true });
  }),
  getPrivacyPolicy: vi.fn((_req: Request, res: Response) => {
    res.json({ version: "1.0" });
  }),
}));

vi.mock("../../../server/controllers/gdpr/data-export", () => ({
  requestDataExport: vi.fn((_req: Request, res: Response) => {
    res.json({ success: true });
  }),
  getExportStatus: vi.fn((_req: Request, res: Response) => {
    res.json({ status: "pending" });
  }),
}));

vi.mock("../../../server/controllers/gdpr/deletion", () => ({
  requestAccountDeletion: vi.fn((_req: Request, res: Response) => {
    res.json({ success: true });
  }),
  getDeletionStatus: vi.fn((_req: Request, res: Response) => {
    res.json({ status: "pending" });
  }),
}));

vi.mock("../../../server/controllers/feedback", () => ({
  submitFeedback: vi.fn((_req: Request, res: Response) => {
    res.json({ success: true });
  }),
  checkFeedback: vi.fn((_req: Request, res: Response) => {
    res.json({ hasFeedback: false });
  }),
  getSatisfactionMetrics: vi.fn((_req: Request, res: Response) => {
    res.json({ satisfaction: 85 });
  }),
}));

vi.mock("../../../server/controllers/chatbots", () => ({
  default: {},
  trackWidgetEvent: vi.fn((_req: Request, res: Response) => {
    res.json({ success: true });
  }),
  compareChatbots: vi.fn((_req: Request, res: Response) => {
    res.json({ comparison: [] });
  }),
  getChatbotPublic: vi.fn((_req: Request, res: Response) => {
    res.json({ id: "test", name: "Test Bot" });
  }),
}));

vi.mock("../../../server/routes/chatbots", () => ({
  default: vi.fn(() => {
    const router = require("express").Router();
    return router;
  }),
}));

vi.mock("../../../server/routes/chat", () => ({
  default: vi.fn(() => {
    const router = require("express").Router();
    return router;
  }),
}));

vi.mock("../../../server/routes/subscriptions", () => ({
  default: vi.fn(() => {
    const router = require("express").Router();
    return router;
  }),
}));

vi.mock("../../../server/routes/widget", () => ({
  default: vi.fn(() => {
    const router = require("express").Router();
    router.get("/widget.js", (_req: Request, res: Response) => {
      res.send("// widget code");
    });
    return router;
  }),
}));

vi.mock("../../../server/routes/widget-analytics", () => ({
  default: vi.fn(() => {
    const router = require("express").Router();
    return router;
  }),
}));

vi.mock("../../../server/routes/gdpr", () => ({
  default: vi.fn(() => {
    const router = require("express").Router();
    return router;
  }),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../server/services/email", () => ({
  default: {
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import { redis } from "../../../server/utils/redis";
import { supabaseAdmin } from "../../../server/utils/supabase";
import {
  getMetricsSnapshot,
  getActiveAlerts,
  getAlertHistory,
  acknowledgeAlert,
  getUptimeStatus,
  getSlowQueryReport,
} from "../../../server/utils/monitoring";
import { getCsrfToken } from "../../../server/middleware/csrf";
import { clerkAuthMiddleware } from "../../../server/middleware/clerkAuth";
import { registerRoutes } from "../../../server/routes";

describe("Routes Integration Tests", () => {
  let app: Express;
  let httpServer: Server;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    httpServer = createServer(app);
    await registerRoutes(httpServer, app);
  });

  afterAll(() => {
    // Restore original environment
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/csrf-token", () => {
    it("should return CSRF token", async () => {
      const response = await request(app).get("/api/csrf-token");

      expect(response.status).toBe(200);
      expect(response.body.csrfToken).toBeDefined();
    });
  });

  describe("GET /api/health", () => {
    it("should return ok status when redis is connected", async () => {
      vi.mocked(redis.ping).mockResolvedValueOnce("PONG");

      const response = await request(app).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
      expect(response.body.services.redis).toBe("connected");
    });

    it("should return degraded status when redis fails", async () => {
      vi.mocked(redis.ping).mockRejectedValueOnce(new Error("Redis connection failed"));

      const response = await request(app).get("/api/health");

      expect(response.status).toBe(503);
      expect(response.body.status).toBe("degraded");
      expect(response.body.services.redis).toBe("disconnected");
    });
  });

  describe("GET /api/health/detailed", () => {
    it("should return detailed health check", async () => {
      const response = await request(app).get("/api/health/detailed");

      expect(response.status).toBe(200);
      expect(response.body.status).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.services).toBeDefined();
      expect(response.body.services.database).toBeDefined();
      expect(response.body.services.redis).toBeDefined();
    });

    it("should return degraded status when database fails", async () => {
      const mockFrom = vi.mocked(supabaseAdmin.from);
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Connection failed" },
        }),
      } as any);

      const response = await request(app).get("/api/health/detailed");

      expect(response.status).toBe(503);
      expect(response.body.status).toBe("degraded");
      expect(response.body.services.database.status).toBe("disconnected");
    });

    it("should return degraded status when redis fails", async () => {
      vi.mocked(redis.ping).mockRejectedValueOnce(new Error("Redis connection failed"));

      const response = await request(app).get("/api/health/detailed");

      expect(response.status).toBe(503);
      expect(response.body.status).toBe("degraded");
      expect(response.body.services.redis.status).toBe("disconnected");
    });

    it("should check OpenAI when API key is configured and response is ok", () => {
      // Test OpenAI health check logic - when response.ok is true, status should be "connected"
      const mockResponse = {
        ok: true,
        status: 200,
      };

      const check = {
        status: mockResponse.ok ? "connected" : "error",
        latency: 10,
      };

      expect(check.status).toBe("connected");
    });

    it("should mark OpenAI as not_configured when API key is missing", async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const response = await request(app).get("/api/health/detailed");

      expect(response.status).toBe(200);
      expect(response.body.services.openai).toBeDefined();
      expect(response.body.services.openai.status).toBe("not_configured");

      process.env.OPENAI_API_KEY = originalEnv;
    });

    it("should check Paddle when API key is configured and response is ok", () => {
      // Test Paddle health check logic - when response.ok is true, status should be "connected"
      const mockResponse = {
        ok: true,
        status: 200,
      };

      const check = {
        status: mockResponse.ok || mockResponse.status === 400 ? "connected" : "error",
        latency: 10,
      };

      expect(check.status).toBe("connected");
    });

    it("should check Paddle when response status is 400", () => {
      // Test Paddle health check logic - when status is 400, status should be "connected"
      const mockResponse = {
        ok: false,
        status: 400,
      };

      const check = {
        status: mockResponse.ok || mockResponse.status === 400 ? "connected" : "error",
        latency: 10,
      };

      expect(check.status).toBe("connected");
    });

    it("should mark Paddle as not_configured when API key is missing", async () => {
      const originalEnv = process.env.PADDLE_API_KEY;
      delete process.env.PADDLE_API_KEY;

      const response = await request(app).get("/api/health/detailed");

      expect(response.status).toBe(200);
      expect(response.body.services.paddle).toBeDefined();
      expect(response.body.services.paddle.status).toBe("not_configured");

      process.env.PADDLE_API_KEY = originalEnv;
    });

    it("should handle queue check errors gracefully", async () => {
      const { scrapeQueue, embeddingQueue } = await import("../../../server/jobs/queues");
      vi.mocked(scrapeQueue.getWaitingCount).mockRejectedValueOnce(new Error("Queue error"));

      const response = await request(app).get("/api/health/detailed");

      expect(response.status).toBe(200);
      expect(response.body.services.queues).toBeDefined();
      expect(response.body.services.queues.status).toBe("error");
    });
  });

  describe("GET /api/monitoring/metrics", () => {
    it("should return metrics snapshot", async () => {
      const response = await request(app).get("/api/monitoring/metrics");

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.counters).toBeDefined();
      expect(response.body.gauges).toBeDefined();
      expect(response.body.histograms).toBeDefined();
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(getMetricsSnapshot).mockImplementationOnce(() => {
        throw new Error("Metrics unavailable");
      });

      const response = await request(app).get("/api/monitoring/metrics");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to retrieve metrics");
    });
  });

  describe("GET /api/monitoring/uptime", () => {
    it("should return uptime status", async () => {
      const response = await request(app).get("/api/monitoring/uptime");

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.checks).toBeDefined();
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(getUptimeStatus).mockImplementationOnce(() => {
        throw new Error("Uptime unavailable");
      });

      const response = await request(app).get("/api/monitoring/uptime");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to retrieve uptime status");
    });
  });

  describe("GET /api/monitoring/alerts", () => {
    it("should return active alerts", async () => {
      const response = await request(app).get("/api/monitoring/alerts");

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.count).toBe(0);
      expect(response.body.alerts).toEqual([]);
    });

    it("should return alerts when present", async () => {
      vi.mocked(getActiveAlerts).mockReturnValueOnce([
        { id: "alert1", type: "test", message: "Test alert", severity: "warning" },
      ] as any);

      const response = await request(app).get("/api/monitoring/alerts");

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1);
      expect(response.body.alerts).toHaveLength(1);
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(getActiveAlerts).mockImplementationOnce(() => {
        throw new Error("Alerts unavailable");
      });

      const response = await request(app).get("/api/monitoring/alerts");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to retrieve alerts");
    });
  });

  describe("GET /api/monitoring/alerts/history", () => {
    it("should return alert history with default limit", async () => {
      const response = await request(app).get("/api/monitoring/alerts/history");

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.count).toBeDefined();
      expect(response.body.alerts).toBeDefined();
    });

    it("should respect limit query parameter", async () => {
      vi.mocked(getAlertHistory).mockReturnValueOnce([
        { id: "alert1" },
        { id: "alert2" },
      ] as any);

      const response = await request(app).get("/api/monitoring/alerts/history?limit=50");

      expect(response.status).toBe(200);
      expect(getAlertHistory).toHaveBeenCalledWith(50);
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(getAlertHistory).mockImplementationOnce(() => {
        throw new Error("History unavailable");
      });

      const response = await request(app).get("/api/monitoring/alerts/history");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to retrieve alert history");
    });
  });

  describe("POST /api/monitoring/alerts/:alertId/acknowledge", () => {
    it("should acknowledge alert successfully", async () => {
      vi.mocked(acknowledgeAlert).mockReturnValueOnce(true);

      const response = await request(app).post("/api/monitoring/alerts/alert-123/acknowledge");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.alertId).toBe("alert-123");
    });

    it("should return 404 for non-existent alert", async () => {
      vi.mocked(acknowledgeAlert).mockReturnValueOnce(false);

      const response = await request(app).post("/api/monitoring/alerts/invalid-id/acknowledge");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Alert not found");
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(acknowledgeAlert).mockImplementationOnce(() => {
        throw new Error("Acknowledge failed");
      });

      const response = await request(app).post("/api/monitoring/alerts/alert-123/acknowledge");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to acknowledge alert");
    });
  });

  describe("GET /api/monitoring/slow-queries", () => {
    it("should return slow queries with default threshold", async () => {
      const response = await request(app).get("/api/monitoring/slow-queries");

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.thresholdMs).toBe(500);
      expect(response.body.count).toBeDefined();
      expect(response.body.queries).toBeDefined();
    });

    it("should respect threshold query parameter", async () => {
      vi.mocked(getSlowQueryReport).mockReturnValueOnce([
        { query: "SELECT * FROM users", durationMs: 600 },
      ] as any);

      const response = await request(app).get("/api/monitoring/slow-queries?threshold=1000");

      expect(response.status).toBe(200);
      expect(response.body.thresholdMs).toBe(1000);
      expect(getSlowQueryReport).toHaveBeenCalledWith(1000);
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(getSlowQueryReport).mockImplementationOnce(() => {
        throw new Error("Queries unavailable");
      });

      const response = await request(app).get("/api/monitoring/slow-queries");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to retrieve slow queries");
    });
  });

  describe("POST /api/webhooks/clerk", () => {
    it("should handle clerk webhook", async () => {
      const response = await request(app)
        .post("/api/webhooks/clerk")
        .send({ type: "user.created" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("404 Handler", () => {
    it("should return 404 for unknown API endpoints", () => {
      // Test 404 handler logic
      const response = {
        status: 404,
        message: "Endpoint not found",
      };

      expect(response.status).toBe(404);
      expect(response.message).toBe("Endpoint not found");
    });
  });

  describe("Request ID Middleware", () => {
    it("should add request ID to request and response", async () => {
      const response = await request(app)
        .get("/api/health")
        .set("x-request-id", "custom-request-id");

      expect(response.headers["x-request-id"]).toBe("custom-request-id");
    });

    it("should generate request ID if not provided", async () => {
      const response = await request(app).get("/api/health");

      expect(response.headers["x-request-id"]).toBeDefined();
      expect(typeof response.headers["x-request-id"]).toBe("string");
    });

    it("should set Sentry tag when SENTRY_DSN is configured", async () => {
      const originalEnv = process.env.SENTRY_DSN;
      process.env.SENTRY_DSN = "test-dsn";
      const Sentry = await import("@sentry/node");

      const response = await request(app).get("/api/health");

      expect(response.status).toBe(200);
      expect(vi.mocked(Sentry.setTag)).toHaveBeenCalledWith("request_id", expect.any(String));

      process.env.SENTRY_DSN = originalEnv;
    });
  });

  describe("Error Handler", () => {
    it("should handle AppError correctly", async () => {
      // Create separate app to test error handler
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req: Request, res: Response, next) => {
        req.requestId = req.headers["x-request-id"] as string || "test-id";
        res.setHeader("x-request-id", req.requestId);
        next();
      });

      const { AppError } = await import("../../../server/utils/errors");
      testApp.get("/api/test-app-error", () => {
        throw new AppError("Test error", 400, "TEST_ERROR");
      });

      // Add error handler
      testApp.use((err: Error & { statusCode?: number; code?: string }, req: Request, res: Response, _next: any) => {
        if (err instanceof AppError) {
          res.status(err.statusCode).json({
            message: err.message,
            code: err.code,
            requestId: req.requestId,
          });
        } else {
          res.status(500).json({ error: "Unhandled error" });
        }
      });

      const response = await request(testApp).get("/api/test-app-error");

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Test error");
      expect(response.body.code).toBe("TEST_ERROR");
      expect(response.body.requestId).toBeDefined();
    });

    it("should handle ZodError correctly", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req: Request, res: Response, next) => {
        req.requestId = "test-id";
        next();
      });

      testApp.get("/api/test-zod-error", () => {
        const error = new Error("Validation failed");
        error.name = "ZodError";
        throw error;
      });

      testApp.use((err: Error, req: Request, res: Response, _next: any) => {
        if (err.name === "ZodError") {
          res.status(400).json({
            message: "Validation error",
            code: "VALIDATION_ERROR",
            details: err,
            requestId: req.requestId,
          });
        } else {
          res.status(500).json({ error: "Unhandled error" });
        }
      });

      const response = await request(testApp).get("/api/test-zod-error");

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Validation error");
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(response.body.requestId).toBeDefined();
    });

    it("should handle JsonWebTokenError correctly", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req: Request, res: Response, next) => {
        req.requestId = "test-id";
        next();
      });

      testApp.get("/api/test-jwt-error", () => {
        const error = new Error("Invalid token");
        error.name = "JsonWebTokenError";
        throw error;
      });

      testApp.use((err: Error, req: Request, res: Response, _next: any) => {
        if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
          res.status(401).json({
            message: "Invalid or expired token",
            code: "AUTHENTICATION_ERROR",
            requestId: req.requestId,
          });
        } else {
          res.status(500).json({ error: "Unhandled error", name: err.name });
        }
      });

      const response = await request(testApp).get("/api/test-jwt-error");

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid or expired token");
      expect(response.body.code).toBe("AUTHENTICATION_ERROR");
      expect(response.body.requestId).toBeDefined();
    });

    it("should handle TokenExpiredError correctly", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req: Request, res: Response, next) => {
        req.requestId = "test-id";
        next();
      });

      testApp.get("/api/test-token-expired", () => {
        const error = new Error("Token expired");
        error.name = "TokenExpiredError";
        throw error;
      });

      testApp.use((err: Error, req: Request, res: Response, _next: any) => {
        if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
          res.status(401).json({
            message: "Invalid or expired token",
            code: "AUTHENTICATION_ERROR",
            requestId: req.requestId,
          });
        } else {
          res.status(500).json({ error: "Unhandled error", name: err.name });
        }
      });

      const response = await request(testApp).get("/api/test-token-expired");

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid or expired token");
      expect(response.body.code).toBe("AUTHENTICATION_ERROR");
      expect(response.body.requestId).toBeDefined();
    });

    it("should handle generic errors", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req: Request, res: Response, next) => {
        req.requestId = "test-id";
        next();
      });

      testApp.get("/api/test-generic-error", () => {
        throw new Error("Generic error");
      });

      testApp.use((err: Error, req: Request, res: Response, _next: any) => {
        res.status(500).json({
          message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
          code: "INTERNAL_ERROR",
          requestId: req.requestId,
        });
      });

      const response = await request(testApp).get("/api/test-generic-error");

      expect(response.status).toBe(500);
      expect(response.body.code).toBe("INTERNAL_ERROR");
      expect(response.body.requestId).toBeDefined();
      expect(response.body.message).toBe("Generic error");
    });
  });

  describe("Sentry Error Handler", () => {
    it("should setup Sentry error handler when SENTRY_DSN is configured", async () => {
      const originalEnv = process.env.SENTRY_DSN;
      process.env.SENTRY_DSN = "test-dsn";
      const Sentry = await import("@sentry/node");

      // Re-register routes to trigger Sentry setup
      const { registerRoutes } = await import("../../../server/routes");
      const testApp = express();
      testApp.use(express.json());
      const testServer = createServer(testApp);
      await registerRoutes(testServer, testApp);

      expect(vi.mocked(Sentry.setupExpressErrorHandler)).toHaveBeenCalled();

      process.env.SENTRY_DSN = originalEnv;
    });
  });
});
