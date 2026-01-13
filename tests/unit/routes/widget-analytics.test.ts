import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import widgetAnalyticsRoutes from "../../../server/routes/widget-analytics";

// Mock dependencies
vi.mock("../../../server/services/widget-analytics", () => ({
  getSessionSummary: vi.fn(),
  getDailyTrends: vi.fn(),
  getTopEvents: vi.fn(),
  getActiveSessions: vi.fn(),
}));

vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock("../../../server/utils/errors", () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(message?: string) {
      super(message || "Not found");
      this.name = "NotFoundError";
    }
  },
  AuthorizationError: class AuthorizationError extends Error {
    constructor() {
      super("Unauthorized");
      this.name = "AuthorizationError";
    }
  },
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { supabaseAdmin } from "../../../server/utils/supabase";
import * as widgetAnalytics from "../../../server/services/widget-analytics";
import { NotFoundError, AuthorizationError } from "../../../server/utils/errors";

// Helper to create chainable query builder
function createMockQueryBuilder(options: {
  selectData?: any;
  selectError?: any;
  terminalMethod?: "gte" | "not" | "range" | "single";
} = {}) {
  // Create a promise that resolves with the data
  const selectPromise = Promise.resolve({
    data: options.selectData ?? [],
    error: options.selectError ?? null,
  });

  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn(),
    not: vi.fn(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({
      data: options.selectData ?? [],
      error: options.selectError ?? null,
      count: Array.isArray(options.selectData) ? options.selectData.length : (options.selectData ? 1 : 0),
    }),
    single: vi.fn().mockResolvedValue({
      data: options.selectData ?? null,
      error: options.selectError ?? null,
    }),
  };

  // Make chain methods return builder
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);

  // Configure terminal methods based on option
  if (options.terminalMethod === "gte") {
    builder.gte.mockReturnValue(selectPromise);
    builder.not.mockReturnValue(builder); // Can chain after gte
  } else if (options.terminalMethod === "not") {
    builder.gte.mockReturnValue(builder); // Can chain before not
    builder.not.mockReturnValue(selectPromise);
  } else {
    // Default: both can chain
    builder.gte.mockReturnValue(builder);
    builder.not.mockReturnValue(builder);
  }

  return builder;
}

describe("Widget Analytics Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req: any, res: any, next: any) => {
      req.user = { userId: "user-123" };
      next();
    });

    app.use("/api/analytics/widget", widgetAnalyticsRoutes);

    // Error handler
    app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err instanceof NotFoundError) {
        res.status(404).json({ message: err.message });
      } else if (err instanceof AuthorizationError) {
        res.status(401).json({ message: "Unauthorized" });
      } else {
        res.status(500).json({ message: err.message });
      }
    });

    vi.clearAllMocks();
  });

  describe("GET /api/analytics/widget/:chatbotId/summary", () => {
    it("should return session summary", async () => {
      const mockSummary = {
        total_sessions: 100,
        unique_visitors: 50,
        total_conversations: 30,
        avg_session_duration_seconds: 120,
        conversion_rate: 0.3,
      };

      vi.mocked(widgetAnalytics.getSessionSummary).mockResolvedValue(mockSummary);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/summary")
        .query({ days: "30" });

      expect(response.status).toBe(200);
      expect(response.body.chatbot_id).toBe("chatbot-123");
      expect(response.body.period_days).toBe(30);
      expect(response.body.summary).toEqual(mockSummary);
      expect(widgetAnalytics.getSessionSummary).toHaveBeenCalledWith("chatbot-123", 30);
    });

    it("should return default summary when getSessionSummary returns null", async () => {
      vi.mocked(widgetAnalytics.getSessionSummary).mockResolvedValue(null);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/summary");

      expect(response.status).toBe(200);
      expect(response.body.summary).toEqual({
        total_sessions: 0,
        unique_visitors: 0,
        total_conversations: 0,
        avg_session_duration_seconds: 0,
        conversion_rate: 0,
      });
    });

    it("should use default days when not provided", async () => {
      vi.mocked(widgetAnalytics.getSessionSummary).mockResolvedValue(null);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      await request(app).get("/api/analytics/widget/chatbot-123/summary");

      expect(widgetAnalytics.getSessionSummary).toHaveBeenCalledWith("chatbot-123", 30);
    });

    it("should return 401 when user is not authenticated", async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.use("/api/analytics/widget", widgetAnalyticsRoutes);
      appWithoutAuth.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (err instanceof AuthorizationError) {
          res.status(401).json({ message: "Unauthorized" });
        } else {
          res.status(500).json({ message: err.message });
        }
      });

      const response = await request(appWithoutAuth)
        .get("/api/analytics/widget/chatbot-123/summary");

      expect(response.status).toBe(401);
    });

    it("should return 404 when chatbot is not found", async () => {
      const builder = createMockQueryBuilder({
        selectData: null,
        selectError: { message: "Not found" },
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/summary");

      expect(response.status).toBe(404);
    });

    it("should handle errors from getSessionSummary", async () => {
      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);
      vi.mocked(widgetAnalytics.getSessionSummary).mockRejectedValue(new Error("Service error"));

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/summary");

      expect(response.status).toBe(500);
    });
  });

  describe("GET /api/analytics/widget/:chatbotId/trends", () => {
    it("should return daily trends", async () => {
      const mockTrends = [
        { date: "2024-01-01", sessions: 10, messages: 50 },
        { date: "2024-01-02", sessions: 15, messages: 75 },
      ];

      vi.mocked(widgetAnalytics.getDailyTrends).mockResolvedValue(mockTrends);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/trends")
        .query({ days: "7" });

      expect(response.status).toBe(200);
      expect(response.body.chatbot_id).toBe("chatbot-123");
      expect(response.body.period_days).toBe(7);
      expect(response.body.trends).toEqual(mockTrends);
      expect(widgetAnalytics.getDailyTrends).toHaveBeenCalledWith("chatbot-123", 7);
    });

    it("should return empty array when getDailyTrends returns null", async () => {
      vi.mocked(widgetAnalytics.getDailyTrends).mockResolvedValue(null as any);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/trends");

      expect(response.status).toBe(200);
      expect(response.body.trends).toEqual([]);
    });

    it("should return 404 when chatbot is not found", async () => {
      const builder = createMockQueryBuilder({
        selectData: null,
        selectError: { message: "Not found" },
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/trends");

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/analytics/widget/:chatbotId/events", () => {
    it("should return top events", async () => {
      const mockEvents = [
        { event_name: "widget_opened", count: 100 },
        { event_name: "message_sent", count: 50 },
      ];

      vi.mocked(widgetAnalytics.getTopEvents).mockResolvedValue(mockEvents);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/events")
        .query({ days: "7", limit: "10" });

      expect(response.status).toBe(200);
      expect(response.body.chatbot_id).toBe("chatbot-123");
      expect(response.body.period_days).toBe(7);
      expect(response.body.events).toEqual(mockEvents);
      expect(widgetAnalytics.getTopEvents).toHaveBeenCalledWith("chatbot-123", 7, 10);
    });

    it("should use default values for days and limit", async () => {
      vi.mocked(widgetAnalytics.getTopEvents).mockResolvedValue([]);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      await request(app).get("/api/analytics/widget/chatbot-123/events");

      expect(widgetAnalytics.getTopEvents).toHaveBeenCalledWith("chatbot-123", 7, 10);
    });

    it("should cap limit at 100", async () => {
      vi.mocked(widgetAnalytics.getTopEvents).mockResolvedValue([]);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      await request(app)
        .get("/api/analytics/widget/chatbot-123/events")
        .query({ limit: "200" });

      expect(widgetAnalytics.getTopEvents).toHaveBeenCalledWith("chatbot-123", 7, 100);
    });

    it("should return empty array when getTopEvents returns null", async () => {
      vi.mocked(widgetAnalytics.getTopEvents).mockResolvedValue(null as any);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/events");

      expect(response.status).toBe(200);
      expect(response.body.events).toEqual([]);
    });
  });

  describe("GET /api/analytics/widget/:chatbotId/active", () => {
    it("should return active sessions count", async () => {
      vi.mocked(widgetAnalytics.getActiveSessions).mockResolvedValue(5);

      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/active");

      expect(response.status).toBe(200);
      expect(response.body.chatbot_id).toBe("chatbot-123");
      expect(response.body.active_sessions).toBe(5);
      expect(response.body.timestamp).toBeDefined();
      expect(widgetAnalytics.getActiveSessions).toHaveBeenCalledWith("chatbot-123");
    });

    it("should return 404 when chatbot is not found", async () => {
      const builder = createMockQueryBuilder({
        selectData: null,
        selectError: { message: "Not found" },
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/active");

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/analytics/widget/:chatbotId/sessions", () => {
    it("should return paginated sessions", async () => {
      const mockSessions = [
        { id: "session-1", started_at: "2024-01-01T10:00:00Z" },
        { id: "session-2", started_at: "2024-01-01T11:00:00Z" },
      ];

      const builder = createMockQueryBuilder({
        selectData: mockSessions,
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(builder as any) // For ownership check
        .mockReturnValueOnce(builder as any); // For sessions query

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/sessions")
        .query({ page: "1", limit: "20" });

      expect(response.status).toBe(200);
      expect(response.body.chatbot_id).toBe("chatbot-123");
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(20);
      expect(response.body.total).toBe(2);
      expect(response.body.sessions).toEqual(mockSessions);
    });

    it("should use default pagination values", async () => {
      const builder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(builder as any)
        .mockReturnValueOnce(builder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/sessions");

      expect(response.status).toBe(200);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(20);
    });

    it("should cap limit at 100", async () => {
      const builder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(builder as any)
        .mockReturnValueOnce(builder as any);

      await request(app)
        .get("/api/analytics/widget/chatbot-123/sessions")
        .query({ limit: "200" });

      expect(builder.range).toHaveBeenCalledWith(0, 99); // offset=0, limit=100-1
    });

    it("should calculate offset correctly for page 2", async () => {
      const builder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(builder as any)
        .mockReturnValueOnce(builder as any);

      await request(app)
        .get("/api/analytics/widget/chatbot-123/sessions")
        .query({ page: "2", limit: "20" });

      expect(builder.range).toHaveBeenCalledWith(20, 39); // offset=20, limit=20
    });

    it("should handle database errors", async () => {
      const builder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const sessionsBuilder = createMockQueryBuilder({
        selectData: null,
        selectError: { message: "Database error" },
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(builder as any)
        .mockReturnValueOnce(sessionsBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/sessions");

      expect(response.status).toBe(500);
    });
  });

  describe("GET /api/analytics/widget/:chatbotId/traffic-sources", () => {
    it("should return traffic source breakdown", async () => {
      const utmSources = [
        { utm_source: "google" },
        { utm_source: "facebook" },
        { utm_source: "google" },
      ];

      const referrers = [
        { referrer: "https://example.com/page" },
        { referrer: "https://test.com/page" },
        { referrer: "https://example.com/page" },
      ];

      const ownershipBuilder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const utmBuilder = createMockQueryBuilder({
        selectData: utmSources,
        selectError: null,
        terminalMethod: "not",
      });

      const referrerBuilder = createMockQueryBuilder({
        selectData: referrers,
        selectError: null,
        terminalMethod: "not",
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(ownershipBuilder as any)
        .mockReturnValueOnce(utmBuilder as any)
        .mockReturnValueOnce(referrerBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/traffic-sources")
        .query({ days: "30" });

      expect(response.status).toBe(200);
      expect(response.body.chatbot_id).toBe("chatbot-123");
      expect(response.body.period_days).toBe(30);
      expect(response.body.utm_sources).toEqual([
        { source: "google", count: 2 },
        { source: "facebook", count: 1 },
      ]);
      expect(response.body.referrers).toEqual([
        { domain: "example.com", count: 2 },
        { domain: "test.com", count: 1 },
      ]);
    });

    it("should handle invalid referrer URLs", async () => {
      const ownershipBuilder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const utmBuilder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
        terminalMethod: "not",
      });

      const referrerBuilder = createMockQueryBuilder({
        selectData: [{ referrer: "invalid-url" }],
        selectError: null,
        terminalMethod: "not",
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(ownershipBuilder as any)
        .mockReturnValueOnce(utmBuilder as any)
        .mockReturnValueOnce(referrerBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/traffic-sources");

      expect(response.status).toBe(200);
      expect(response.body.referrers).toEqual([
        { domain: "direct", count: 1 },
      ]);
    });

    it("should handle null referrers", async () => {
      const ownershipBuilder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const utmBuilder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
        terminalMethod: "not",
      });

      const referrerBuilder = createMockQueryBuilder({
        selectData: [{ referrer: null }],
        selectError: null,
        terminalMethod: "not",
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(ownershipBuilder as any)
        .mockReturnValueOnce(utmBuilder as any)
        .mockReturnValueOnce(referrerBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/traffic-sources");

      expect(response.status).toBe(200);
      expect(response.body.referrers).toEqual([
        { domain: "direct", count: 1 },
      ]);
    });

    it("should handle UTM source errors", async () => {
      const ownershipBuilder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const utmBuilder = createMockQueryBuilder({
        selectData: null,
        selectError: { message: "Database error" },
        terminalMethod: "not",
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(ownershipBuilder as any)
        .mockReturnValueOnce(utmBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/traffic-sources");

      expect(response.status).toBe(500);
    });

    it("should handle referrer errors", async () => {
      const ownershipBuilder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const utmBuilder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      const referrerBuilder = createMockQueryBuilder({
        selectData: null,
        selectError: { message: "Database error" },
        terminalMethod: "not",
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(ownershipBuilder as any)
        .mockReturnValueOnce(utmBuilder as any)
        .mockReturnValueOnce(referrerBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/traffic-sources");

      expect(response.status).toBe(500);
    });
  });

  describe("GET /api/analytics/widget/:chatbotId/devices", () => {
    it("should return device breakdown", async () => {
      const devices = [
        { device_type: "mobile", browser_name: "Safari", os_name: "iOS" },
        { device_type: "desktop", browser_name: "Chrome", os_name: "Windows" },
        { device_type: "mobile", browser_name: "Chrome", os_name: "Android" },
        { device_type: "tablet", browser_name: "Safari", os_name: "iPadOS" },
      ];

      const ownershipBuilder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const devicesBuilder = createMockQueryBuilder({
        selectData: devices,
        selectError: null,
        terminalMethod: "gte",
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(ownershipBuilder as any)
        .mockReturnValueOnce(devicesBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/devices")
        .query({ days: "30" });

      expect(response.status).toBe(200);
      expect(response.body.chatbot_id).toBe("chatbot-123");
      expect(response.body.period_days).toBe(30);
      expect(response.body.devices).toEqual([
        { type: "mobile", count: 2 },
        { type: "desktop", count: 1 },
        { type: "tablet", count: 1 },
      ]);
      expect(response.body.browsers).toEqual([
        { name: "Safari", count: 2 },
        { name: "Chrome", count: 2 },
      ]);
      expect(response.body.operating_systems).toEqual([
        { name: "iOS", count: 1 },
        { name: "Windows", count: 1 },
        { name: "Android", count: 1 },
        { name: "iPadOS", count: 1 },
      ]);
    });

    it("should limit browsers and OS to top 10", async () => {
      const devices = Array.from({ length: 15 }, (_, i) => ({
        device_type: "desktop",
        browser_name: `Browser${i}`,
        os_name: `OS${i}`,
      }));

      const ownershipBuilder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const devicesBuilder = createMockQueryBuilder({
        selectData: devices,
        selectError: null,
        terminalMethod: "gte",
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(ownershipBuilder as any)
        .mockReturnValueOnce(devicesBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/devices");

      expect(response.status).toBe(200);
      expect(response.body.browsers.length).toBe(10);
      expect(response.body.operating_systems.length).toBe(10);
    });

    it("should handle null device values", async () => {
      const devices = [
        { device_type: null, browser_name: null, os_name: null },
      ];

      const ownershipBuilder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const devicesBuilder = createMockQueryBuilder({
        selectData: devices,
        selectError: null,
        terminalMethod: "gte",
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(ownershipBuilder as any)
        .mockReturnValueOnce(devicesBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/devices");

      expect(response.status).toBe(200);
      expect(response.body.devices).toEqual([
        { type: "unknown", count: 1 },
      ]);
      expect(response.body.browsers).toEqual([
        { name: "unknown", count: 1 },
      ]);
      expect(response.body.operating_systems).toEqual([
        { name: "unknown", count: 1 },
      ]);
    });

    it("should handle database errors", async () => {
      const ownershipBuilder = createMockQueryBuilder({
        selectData: { id: "chatbot-123" },
        selectError: null,
      });

      const devicesBuilder = createMockQueryBuilder({
        selectData: null,
        selectError: { message: "Database error" },
        terminalMethod: "gte",
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(ownershipBuilder as any)
        .mockReturnValueOnce(devicesBuilder as any);

      const response = await request(app)
        .get("/api/analytics/widget/chatbot-123/devices");

      expect(response.status).toBe(500);
    });
  });
});
