/**
 * Widget Analytics API Routes
 *
 * Endpoints for retrieving widget analytics data
 * Protected by authentication middleware
 */

import { Router, Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/clerkAuth";
import { NotFoundError, AuthorizationError } from "../utils/errors";
import { supabaseAdmin } from "../utils/supabase";
import * as widgetAnalytics from "../services/widget-analytics";
import logger from "../utils/logger";

const router = Router();

/**
 * Helper: Verify chatbot ownership
 */
async function verifyChatbotOwnership(
  userId: string,
  chatbotId: string
): Promise<boolean> {
  const { data: chatbot, error } = await supabaseAdmin
    .from("chatbots")
    .select("id")
    .eq("id", chatbotId)
    .eq("user_id", userId)
    .single();

  if (error || !chatbot) {
    return false;
  }

  return true;
}

// ============================================
// Analytics Dashboard Endpoints
// ============================================

/**
 * GET /api/analytics/widget/:chatbotId/summary
 * Get high-level session summary for a chatbot
 */
router.get(
  "/:chatbotId/summary",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthorizationError();
      }

      const { chatbotId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      // Verify ownership
      const isOwner = await verifyChatbotOwnership(req.user.userId, chatbotId);
      if (!isOwner) {
        throw new NotFoundError("Chatbot not found");
      }

      const summary = await widgetAnalytics.getSessionSummary(chatbotId, days);

      res.json({
        chatbot_id: chatbotId,
        period_days: days,
        summary: summary || {
          total_sessions: 0,
          unique_visitors: 0,
          total_conversations: 0,
          avg_session_duration_seconds: 0,
          conversion_rate: 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/analytics/widget/:chatbotId/trends
 * Get daily trends for a chatbot
 */
router.get(
  "/:chatbotId/trends",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthorizationError();
      }

      const { chatbotId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      // Verify ownership
      const isOwner = await verifyChatbotOwnership(req.user.userId, chatbotId);
      if (!isOwner) {
        throw new NotFoundError("Chatbot not found");
      }

      const trends = await widgetAnalytics.getDailyTrends(chatbotId, days);

      res.json({
        chatbot_id: chatbotId,
        period_days: days,
        trends: trends || [],
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/analytics/widget/:chatbotId/events
 * Get top events for a chatbot
 */
router.get(
  "/:chatbotId/events",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthorizationError();
      }

      const { chatbotId } = req.params;
      const days = parseInt(req.query.days as string) || 7;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

      // Verify ownership
      const isOwner = await verifyChatbotOwnership(req.user.userId, chatbotId);
      if (!isOwner) {
        throw new NotFoundError("Chatbot not found");
      }

      const events = await widgetAnalytics.getTopEvents(chatbotId, days, limit);

      res.json({
        chatbot_id: chatbotId,
        period_days: days,
        events: events || [],
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/analytics/widget/:chatbotId/active
 * Get real-time active sessions count
 */
router.get(
  "/:chatbotId/active",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthorizationError();
      }

      const { chatbotId } = req.params;

      // Verify ownership
      const isOwner = await verifyChatbotOwnership(req.user.userId, chatbotId);
      if (!isOwner) {
        throw new NotFoundError("Chatbot not found");
      }

      const activeCount = await widgetAnalytics.getActiveSessions(chatbotId);

      res.json({
        chatbot_id: chatbotId,
        active_sessions: activeCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/analytics/widget/:chatbotId/sessions
 * Get recent sessions with pagination
 */
router.get(
  "/:chatbotId/sessions",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthorizationError();
      }

      const { chatbotId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      // Verify ownership
      const isOwner = await verifyChatbotOwnership(req.user.userId, chatbotId);
      if (!isOwner) {
        throw new NotFoundError("Chatbot not found");
      }

      // Get sessions
      const { data: sessions, error, count } = await supabaseAdmin
        .from("widget_sessions")
        .select("*", { count: "exact" })
        .eq("chatbot_id", chatbotId)
        .order("started_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      res.json({
        chatbot_id: chatbotId,
        page,
        limit,
        total: count || 0,
        sessions: sessions || [],
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/analytics/widget/:chatbotId/traffic-sources
 * Get traffic source breakdown
 */
router.get(
  "/:chatbotId/traffic-sources",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthorizationError();
      }

      const { chatbotId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Verify ownership
      const isOwner = await verifyChatbotOwnership(req.user.userId, chatbotId);
      if (!isOwner) {
        throw new NotFoundError("Chatbot not found");
      }

      // Get UTM source breakdown
      const { data: utmSources, error: utmError } = await supabaseAdmin
        .from("widget_sessions")
        .select("utm_source")
        .eq("chatbot_id", chatbotId)
        .gte("started_at", startDate.toISOString())
        .not("utm_source", "is", null);

      if (utmError) {
        throw utmError;
      }

      // Get referrer breakdown
      const { data: referrers, error: refError } = await supabaseAdmin
        .from("widget_sessions")
        .select("referrer")
        .eq("chatbot_id", chatbotId)
        .gte("started_at", startDate.toISOString())
        .not("referrer", "is", null);

      if (refError) {
        throw refError;
      }

      // Aggregate counts
      const utmCounts: Record<string, number> = {};
      utmSources?.forEach((row) => {
        const source = row.utm_source || "unknown";
        utmCounts[source] = (utmCounts[source] || 0) + 1;
      });

      const referrerCounts: Record<string, number> = {};
      referrers?.forEach((row) => {
        try {
          const domain = row.referrer ? new URL(row.referrer).hostname : "direct";
          referrerCounts[domain] = (referrerCounts[domain] || 0) + 1;
        } catch {
          referrerCounts["direct"] = (referrerCounts["direct"] || 0) + 1;
        }
      });

      res.json({
        chatbot_id: chatbotId,
        period_days: days,
        utm_sources: Object.entries(utmCounts)
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count),
        referrers: Object.entries(referrerCounts)
          .map(([domain, count]) => ({ domain, count }))
          .sort((a, b) => b.count - a.count),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/analytics/widget/:chatbotId/devices
 * Get device type breakdown
 */
router.get(
  "/:chatbotId/devices",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthorizationError();
      }

      const { chatbotId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Verify ownership
      const isOwner = await verifyChatbotOwnership(req.user.userId, chatbotId);
      if (!isOwner) {
        throw new NotFoundError("Chatbot not found");
      }

      // Get device breakdown
      const { data: devices, error } = await supabaseAdmin
        .from("widget_sessions")
        .select("device_type, browser_name, os_name")
        .eq("chatbot_id", chatbotId)
        .gte("started_at", startDate.toISOString());

      if (error) {
        throw error;
      }

      // Aggregate counts
      const deviceCounts: Record<string, number> = {};
      const browserCounts: Record<string, number> = {};
      const osCounts: Record<string, number> = {};

      devices?.forEach((row) => {
        const device = row.device_type || "unknown";
        const browser = row.browser_name || "unknown";
        const os = row.os_name || "unknown";

        deviceCounts[device] = (deviceCounts[device] || 0) + 1;
        browserCounts[browser] = (browserCounts[browser] || 0) + 1;
        osCounts[os] = (osCounts[os] || 0) + 1;
      });

      res.json({
        chatbot_id: chatbotId,
        period_days: days,
        devices: Object.entries(deviceCounts)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
        browsers: Object.entries(browserCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        operating_systems: Object.entries(osCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
