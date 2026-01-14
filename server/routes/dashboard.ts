import { Router } from "express";
import * as dashboardController from "../controllers/dashboard";
import { clerkAuthMiddleware } from "../middleware/clerkAuth";

const router = Router();

/**
 * @openapi
 * /api/dashboard/overview:
 *   get:
 *     summary: Get Dashboard Overview
 *     description: Get consolidated dashboard data including stats, chatbots, message volume, comparisons, sentiment and satisfaction metrics. This endpoint combines multiple API calls for better performance.
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *           minimum: 1
 *           maximum: 90
 *         description: Number of days for message volume data
 *     responses:
 *       200:
 *         description: Dashboard data fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalChatbots:
 *                       type: integer
 *                     activeChatbots:
 *                       type: integer
 *                     totalMessages:
 *                       type: integer
 *                     totalConversations:
 *                       type: integer
 *                     avgResponseTime:
 *                       type: number
 *                       nullable: true
 *                 chatbots:
 *                   type: array
 *                   items:
 *                     type: object
 *                 messageVolume:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       messages:
 *                         type: integer
 *                 chatbotComparison:
 *                   type: array
 *                   items:
 *                     type: object
 *                 sentiment:
 *                   type: object
 *                   nullable: true
 *                 satisfaction:
 *                   type: object
 *                   nullable: true
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get(
  "/overview",
  clerkAuthMiddleware,
  dashboardController.getDashboardOverview
);

export default router;
