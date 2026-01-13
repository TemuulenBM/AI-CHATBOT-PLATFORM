import { Router } from "express";
import * as adminController from "../controllers/admin";
import { clerkAuthMiddleware, loadSubscription } from "../middleware/clerkAuth";
import { loadAdminStatus, requireAdmin } from "../middleware/adminAuth";

const router = Router();

// Apply authentication middleware to all admin routes
router.use(clerkAuthMiddleware);
router.use(loadSubscription);
router.use(loadAdminStatus);

// Admin status endpoint (no admin required - checks if user is admin)
router.get("/status", adminController.getAdminStatus);

// Protected admin endpoints (require admin role)
router.use(requireAdmin);

/**
 * @openapi
 * /api/admin/cleanup-analytics:
 *   post:
 *     summary: Manually trigger analytics cleanup job
 *     description: Triggers the analytics cleanup job to delete old widget events and sessions according to retention policies
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup job queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 jobId:
 *                   type: string
 *                 queuedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 */
router.post("/cleanup-analytics", adminController.triggerAnalyticsCleanup);

/**
 * @openapi
 * /api/admin/cleanup-analytics/status:
 *   get:
 *     summary: Get analytics cleanup job queue status
 *     description: Returns the current status of the analytics cleanup job queue including waiting, active, completed, and failed job counts
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Queue status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 queue:
 *                   type: object
 *                   properties:
 *                     waiting:
 *                       type: number
 *                     active:
 *                       type: number
 *                     completed:
 *                       type: number
 *                     failed:
 *                       type: number
 *                 scheduledJobs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: string
 *                       pattern:
 *                         type: string
 *                       next:
 *                         type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 */
router.get("/cleanup-analytics/status", adminController.getCleanupStatus);

export default router;
