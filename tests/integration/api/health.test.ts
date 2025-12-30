import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express, { Express, Request, Response, NextFunction } from "express";
import request from "supertest";

// Mock Redis
vi.mock("../../../server/utils/redis", () => ({
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
  },
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock Supabase
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "test" }], error: null }),
    })),
  },
  PLAN_LIMITS: {
    free: { chatbots: 1, messages: 100, price: 0 },
    starter: { chatbots: 3, messages: 2000, price: 4900 },
  },
}));

// Mock monitoring
vi.mock("../../../server/utils/monitoring", () => ({
  recordRequestMetrics: vi.fn(),
  getMetricsSnapshot: vi.fn().mockReturnValue({
    requests: { total: 100, success: 95, error: 5 },
    latency: { avg: 50, p95: 100, p99: 150 },
  }),
  getActiveAlerts: vi.fn().mockReturnValue([]),
  getAlertHistory: vi.fn().mockReturnValue([]),
  acknowledgeAlert: vi.fn().mockReturnValue(true),
  getUptimeStatus: vi.fn().mockReturnValue({
    database: { status: "up", lastCheck: new Date().toISOString() },
    redis: { status: "up", lastCheck: new Date().toISOString() },
  }),
  getSlowQueryReport: vi.fn().mockReturnValue([]),
  initializeMonitoring: vi.fn(),
  registerUptimeCheck: vi.fn(),
  reportCriticalError: vi.fn(),
}));

// Mock queues
vi.mock("../../../server/jobs/queues", () => ({
  scrapeQueue: {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
  },
  embeddingQueue: {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
  },
}));

// Mock logger
vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { redis } from "../../../server/utils/redis";
import { supabaseAdmin } from "../../../server/utils/supabase";
import {
  getMetricsSnapshot,
  getActiveAlerts,
  getUptimeStatus,
} from "../../../server/utils/monitoring";

describe("Health and Monitoring API Endpoints", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Basic health check
    app.get("/api/health", async (_req: Request, res: Response) => {
      try {
        await (redis.ping as ReturnType<typeof vi.fn>)();
        res.json({
          status: "ok",
          timestamp: new Date().toISOString(),
          services: { redis: "connected" },
        });
      } catch {
        res.status(503).json({
          status: "degraded",
          timestamp: new Date().toISOString(),
          services: { redis: "disconnected" },
        });
      }
    });

    // Monitoring endpoints
    app.get("/api/monitoring/metrics", async (_req: Request, res: Response) => {
      try {
        const metrics = (getMetricsSnapshot as ReturnType<typeof vi.fn>)();
        res.json({
          timestamp: new Date().toISOString(),
          ...metrics,
        });
      } catch {
        res.status(500).json({ error: "Failed to retrieve metrics" });
      }
    });

    app.get("/api/monitoring/uptime", async (_req: Request, res: Response) => {
      try {
        const uptime = (getUptimeStatus as ReturnType<typeof vi.fn>)();
        res.json({
          timestamp: new Date().toISOString(),
          checks: uptime,
        });
      } catch {
        res.status(500).json({ error: "Failed to retrieve uptime status" });
      }
    });

    app.get("/api/monitoring/alerts", async (_req: Request, res: Response) => {
      try {
        const active = (getActiveAlerts as ReturnType<typeof vi.fn>)();
        res.json({
          timestamp: new Date().toISOString(),
          count: active.length,
          alerts: active,
        });
      } catch {
        res.status(500).json({ error: "Failed to retrieve alerts" });
      }
    });

    vi.clearAllMocks();
  });

  describe("GET /api/health", () => {
    it("should return ok status when redis is connected", async () => {
      (redis.ping as ReturnType<typeof vi.fn>).mockResolvedValueOnce("PONG");

      const response = await request(app).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
      expect(response.body.services.redis).toBe("connected");
    });

    it("should return degraded status when redis is disconnected", async () => {
      (redis.ping as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Connection failed")
      );

      const response = await request(app).get("/api/health");

      expect(response.status).toBe(503);
      expect(response.body.status).toBe("degraded");
      expect(response.body.services.redis).toBe("disconnected");
    });
  });

  describe("GET /api/monitoring/metrics", () => {
    it("should return metrics snapshot", async () => {
      const response = await request(app).get("/api/monitoring/metrics");

      expect(response.status).toBe(200);
      expect(response.body.requests).toBeDefined();
      expect(response.body.requests.total).toBe(100);
      expect(response.body.latency).toBeDefined();
    });

    it("should return error on failure", async () => {
      (getMetricsSnapshot as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw new Error("Metrics unavailable");
        }
      );

      const response = await request(app).get("/api/monitoring/metrics");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to retrieve metrics");
    });
  });

  describe("GET /api/monitoring/uptime", () => {
    it("should return uptime status", async () => {
      const response = await request(app).get("/api/monitoring/uptime");

      expect(response.status).toBe(200);
      expect(response.body.checks).toBeDefined();
      expect(response.body.checks.database).toBeDefined();
      expect(response.body.checks.redis).toBeDefined();
    });
  });

  describe("GET /api/monitoring/alerts", () => {
    it("should return empty alerts when none active", async () => {
      const response = await request(app).get("/api/monitoring/alerts");

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
      expect(response.body.alerts).toEqual([]);
    });

    it("should return active alerts", async () => {
      (getActiveAlerts as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        { id: "alert1", type: "high_latency", message: "API latency high" },
      ]);

      const response = await request(app).get("/api/monitoring/alerts");

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1);
      expect(response.body.alerts[0].id).toBe("alert1");
    });
  });
});
