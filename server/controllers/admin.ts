import { Request, Response, NextFunction } from "express";
import { Job } from "bullmq";
import { triggerCleanup } from "../jobs/widget-analytics-cleanup";
import { analyticsCleanupQueue } from "../jobs/queues";
import logger from "../utils/logger";

/**
 * Get admin status for current user
 */
export async function getAdminStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.status(200).json({
      isAdmin: req.isAdmin || false,
      userId: req.user?.userId,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Manually trigger analytics cleanup job
 */
export async function triggerAnalyticsCleanup(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info("Admin triggered analytics cleanup", {
      userId: req.user?.userId,
      email: req.user?.email,
    });

    const job: Job = await triggerCleanup();

    res.status(200).json({
      success: true,
      message: "Analytics cleanup job queued successfully",
      jobId: job.id,
      queuedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to trigger analytics cleanup", {
      error,
      userId: req.user?.userId,
    });
    next(error);
  }
}

/**
 * Get analytics cleanup job queue status
 */
export async function getCleanupStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [waiting, active, completed, failed, repeatableJobs] = await Promise.all([
      analyticsCleanupQueue.getWaitingCount(),
      analyticsCleanupQueue.getActiveCount(),
      analyticsCleanupQueue.getCompletedCount(),
      analyticsCleanupQueue.getFailedCount(),
      analyticsCleanupQueue.getRepeatableJobs(),
    ]);

    res.status(200).json({
      status: "ok",
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
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get cleanup status", { error });
    next(error);
  }
}
