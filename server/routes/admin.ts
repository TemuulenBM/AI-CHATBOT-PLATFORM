/**
 * Admin API Routes
 *
 * Endpoints for admin-only operations
 * Requires authentication and admin privileges
 */

import { Router, Request, Response, NextFunction } from "express";
import { clerkAuthMiddleware } from "../middleware/clerkAuth";
import { loadAdminStatus, requireAdmin, AdminAuthenticatedRequest } from "../middleware/adminAuth";
import { triggerCleanup } from "../jobs/widget-analytics-cleanup";
import { analyticsCleanupQueue } from "../jobs/queues";
import logger from "../utils/logger";

const router = Router();

// Apply authentication and admin middleware to all routes
router.use(clerkAuthMiddleware);
router.use(loadAdminStatus);

/**
 * GET /api/admin/status
 * Get admin status for the authenticated user
 */
router.get("/status", (req: AdminAuthenticatedRequest, res: Response) => {
  res.json({
    isAdmin: req.isAdmin || false,
    userId: req.user?.userId,
  });
});

/**
 * POST /api/admin/cleanup-analytics
 * Manually trigger analytics cleanup job
 * Requires admin access
 */
router.post(
  "/cleanup-analytics",
  requireAdmin,
  async (req: AdminAuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const job = await triggerCleanup();

      res.json({
        success: true,
        message: "Analytics cleanup job queued successfully",
        jobId: job.id,
        queuedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to trigger analytics cleanup", { error });
      next(error);
    }
  }
);

/**
 * GET /api/admin/cleanup-analytics/status
 * Get analytics cleanup queue status
 * Requires admin access
 */
router.get(
  "/cleanup-analytics/status",
  requireAdmin,
  async (req: AdminAuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [waiting, active, completed, failed, repeatableJobs] = await Promise.all([
        analyticsCleanupQueue.getWaitingCount(),
        analyticsCleanupQueue.getActiveCount(),
        analyticsCleanupQueue.getCompletedCount(),
        analyticsCleanupQueue.getFailedCount(),
        analyticsCleanupQueue.getRepeatableJobs(),
      ]);

      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        queue: {
          waiting,
          active,
          completed,
          failed,
        },
        scheduledJobs: repeatableJobs.map((job) => ({
          key: job.key,
          pattern: job.pattern,
          next: job.next,
        })),
      });
    } catch (error) {
      logger.error("Failed to get cleanup queue status", { error });
      next(error);
    }
  }
);

export default router;
