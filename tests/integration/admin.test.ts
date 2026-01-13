import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import adminRoutes from "../../server/routes/admin";

/**
 * Integration tests for Admin API endpoints
 * Tests the complete flow of admin routes with authentication and authorization
 */

// Mock dependencies before imports
vi.mock("../../server/middleware/clerkAuth", () => ({
  clerkAuthMiddleware: (req: any, res: any, next: any) => {
    // Mock authenticated user
    req.user = { userId: "user-123", email: "admin@example.com" };
    next();
  },
  loadSubscription: (req: any, res: any, next: any) => {
    req.subscription = { plan: "business" };
    next();
  },
}));

vi.mock("../../server/middleware/adminAuth", () => ({
  loadAdminStatus: (req: any, res: any, next: any) => {
    // Set admin status based on test context
    req.isAdmin = req.headers["x-test-admin"] === "true";
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => {
    if (req.isAdmin) {
      next();
    } else {
      res.status(403).json({ error: "Admin access required" });
    }
  },
}));

vi.mock("../../server/jobs/widget-analytics-cleanup", () => ({
  triggerCleanup: vi.fn().mockResolvedValue({ id: "job-123", name: "manual-cleanup" }),
}));

vi.mock("../../server/jobs/queues", () => ({
  analyticsCleanupQueue: {
    getWaitingCount: vi.fn().mockResolvedValue(5),
    getActiveCount: vi.fn().mockResolvedValue(1),
    getCompletedCount: vi.fn().mockResolvedValue(100),
    getFailedCount: vi.fn().mockResolvedValue(2),
    getRepeatableJobs: vi.fn().mockResolvedValue([
      {
        key: "repeat:analytics-cleanup:daily-cleanup",
        pattern: "0 2 * * *",
        next: Date.now() + 86400000,
      },
    ]),
  },
}));

vi.mock("../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Admin API Integration Tests", () => {
  let app: Express;

  beforeAll(() => {
    // Create test Express app
    app = express();
    app.use(cookieParser());
    app.use(express.json());

    // Mount admin routes
    app.use("/api/admin", adminRoutes);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/admin/status", () => {
    it("should return admin status for admin user", async () => {
      const response = await request(app)
        .get("/api/admin/status")
        .set("x-test-admin", "true")
        .expect(200);

      expect(response.body).toEqual({
        isAdmin: true,
        userId: "user-123",
      });
    });

    it("should return non-admin status for regular user", async () => {
      const response = await request(app)
        .get("/api/admin/status")
        .set("x-test-admin", "false")
        .expect(200);

      expect(response.body).toEqual({
        isAdmin: false,
        userId: "user-123",
      });
    });
  });

  describe("POST /api/admin/cleanup-analytics", () => {
    it("should trigger cleanup job as admin", async () => {
      const { triggerCleanup } = await import("../../server/jobs/widget-analytics-cleanup");

      const response = await request(app)
        .post("/api/admin/cleanup-analytics")
        .set("x-test-admin", "true")
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: "Analytics cleanup job queued successfully",
        jobId: "job-123",
      });
      expect(response.body.queuedAt).toBeDefined();
      expect(triggerCleanup).toHaveBeenCalledOnce();
    });

    it("should deny access for non-admin user", async () => {
      const { triggerCleanup } = await import("../../server/jobs/widget-analytics-cleanup");

      const response = await request(app)
        .post("/api/admin/cleanup-analytics")
        .set("x-test-admin", "false")
        .expect(403);

      expect(response.body).toEqual({
        error: "Admin access required",
      });
      expect(triggerCleanup).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/admin/cleanup-analytics/status", () => {
    it("should return queue status as admin", async () => {
      const { analyticsCleanupQueue } = await import("../../server/jobs/queues");

      const response = await request(app)
        .get("/api/admin/cleanup-analytics/status")
        .set("x-test-admin", "true")
        .expect(200);

      expect(response.body).toMatchObject({
        status: "ok",
        queue: {
          waiting: 5,
          active: 1,
          completed: 100,
          failed: 2,
        },
        scheduledJobs: [
          {
            key: "repeat:analytics-cleanup:daily-cleanup",
            pattern: "0 2 * * *",
          },
        ],
      });
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.scheduledJobs[0].next).toBeDefined();

      expect(analyticsCleanupQueue.getWaitingCount).toHaveBeenCalledOnce();
      expect(analyticsCleanupQueue.getActiveCount).toHaveBeenCalledOnce();
      expect(analyticsCleanupQueue.getCompletedCount).toHaveBeenCalledOnce();
      expect(analyticsCleanupQueue.getFailedCount).toHaveBeenCalledOnce();
      expect(analyticsCleanupQueue.getRepeatableJobs).toHaveBeenCalledOnce();
    });

    it("should deny access for non-admin user", async () => {
      const { analyticsCleanupQueue } = await import("../../server/jobs/queues");

      const response = await request(app)
        .get("/api/admin/cleanup-analytics/status")
        .set("x-test-admin", "false")
        .expect(403);

      expect(response.body).toEqual({
        error: "Admin access required",
      });
      expect(analyticsCleanupQueue.getWaitingCount).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle triggerCleanup errors gracefully", async () => {
      const { triggerCleanup } = await import("../../server/jobs/widget-analytics-cleanup");
      vi.mocked(triggerCleanup).mockRejectedValueOnce(new Error("Redis connection failed"));

      const response = await request(app)
        .post("/api/admin/cleanup-analytics")
        .set("x-test-admin", "true")
        .expect(500);

      expect(response.body).toBeDefined();
    });

    it("should handle queue status errors gracefully", async () => {
      const { analyticsCleanupQueue } = await import("../../server/jobs/queues");
      vi.mocked(analyticsCleanupQueue.getWaitingCount).mockRejectedValueOnce(
        new Error("Queue not available")
      );

      const response = await request(app)
        .get("/api/admin/cleanup-analytics/status")
        .set("x-test-admin", "true")
        .expect(500);

      expect(response.body).toBeDefined();
    });
  });
});
