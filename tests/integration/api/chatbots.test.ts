import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express, { Express, Request, Response, NextFunction } from "express";
import request from "supertest";

// Set environment variables before any imports
process.env.CLERK_SECRET_KEY = "test-clerk-secret";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.REDIS_URL = "redis://localhost:6379";

// Mock all external dependencies
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      getUser: vi.fn().mockResolvedValue({
        id: "user_test123",
        emailAddresses: [{ emailAddress: "test@example.com" }],
      }),
    },
  }),
  verifyToken: vi.fn().mockResolvedValue({ sub: "user_test123" }),
}));

vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null, data: { id: "chatbot_new" } }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({
      data: { allowed: true, current_usage: 1, limit: 100 },
      error: null,
    }),
  },
  PLAN_LIMITS: {
    free: { chatbots: 1, messages: 100, price: 0 },
    starter: { chatbots: 3, messages: 2000, price: 4900 },
    growth: { chatbots: 10, messages: 10000, price: 9900 },
    business: { chatbots: 999, messages: 50000, price: 29900 },
  },
}));

vi.mock("../../../server/utils/redis", () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("../../../server/jobs/queues", () => ({
  getRedisConnection: vi.fn(() => ({
    host: "localhost",
    port: 6379,
    maxRetriesPerRequest: null,
  })),
  scrapeQueue: {
    add: vi.fn().mockResolvedValue({ id: "job_123" }),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
  },
  embeddingQueue: {
    add: vi.fn().mockResolvedValue({ id: "job_456" }),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("../../../server/services/analytics", () => ({
  analyticsService: {
    getDashboardStats: vi.fn().mockResolvedValue({
      totalConversations: 100,
      totalMessages: 500,
      averageResponseTime: 1.5,
      satisfactionRate: 0.85,
    }),
    getMessageVolumeByDay: vi.fn().mockResolvedValue([
      { date: "2024-01-01", count: 10 },
    ]),
    getConversationsWithMessages: vi.fn().mockResolvedValue({
      conversations: [],
      total: 0,
    }),
    getSentimentBreakdown: vi.fn().mockResolvedValue({
      positive: 50,
      neutral: 30,
      negative: 20,
    }),
  },
}));

vi.mock("../../../server/services/rescrape", () => ({
  rescrapeService: {
    manualRescrape: vi.fn().mockResolvedValue({ success: true, historyId: "history_123" }),
    getScrapeHistory: vi.fn().mockResolvedValue([]),
    updateScrapeSchedule: vi.fn().mockResolvedValue({ autoScrapeEnabled: true, scrapeFrequency: "weekly" }),
    getScrapeSchedule: vi.fn().mockResolvedValue({ autoScrapeEnabled: false, scrapeFrequency: "manual" }),
  },
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "../../../server/utils/supabase";

describe("Chatbots API Endpoints", () => {
  let app: Express;
  let listChatbots: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let createChatbot: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let getChatbot: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let updateChatbot: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let deleteChatbot: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let getStats: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let clerkAuthMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let loadSubscription: (req: Request, res: Response, next: NextFunction) => Promise<void>;

  beforeAll(async () => {
    const controllers = await import("../../../server/controllers/chatbots");
    listChatbots = controllers.listChatbots;
    createChatbot = controllers.createChatbot;
    getChatbot = controllers.getChatbot;
    updateChatbot = controllers.updateChatbot;
    deleteChatbot = controllers.deleteChatbot;
    getStats = controllers.getStats;

    const middleware = await import("../../../server/middleware/clerkAuth");
    clerkAuthMiddleware = middleware.clerkAuthMiddleware;
    loadSubscription = middleware.loadSubscription;
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Setup routes with middleware
    app.get("/api/chatbots", clerkAuthMiddleware, loadSubscription, listChatbots);
    app.post("/api/chatbots", clerkAuthMiddleware, loadSubscription, createChatbot);
    app.get("/api/chatbots/:id", clerkAuthMiddleware, loadSubscription, getChatbot);
    app.patch("/api/chatbots/:id", clerkAuthMiddleware, loadSubscription, updateChatbot);
    app.delete("/api/chatbots/:id", clerkAuthMiddleware, loadSubscription, deleteChatbot);
    app.get("/api/chatbots/:id/analytics/dashboard", clerkAuthMiddleware, loadSubscription, getStats);

    // Error handler
    app.use((err: Error & { statusCode?: number }, req: Request, res: Response, next: NextFunction) => {
      res.status(err.statusCode || 500).json({ message: err.message });
    });

    vi.clearAllMocks();
    (verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({ sub: "user_test123" });
  });

  describe("GET /api/chatbots", () => {
    it("should require authentication", async () => {
      (verifyToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Invalid token"));

      const response = await request(app).get("/api/chatbots");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/chatbots/:id", () => {
    it("should return a specific chatbot", async () => {
      const mockChatbot = {
        id: "chatbot_test123",
        name: "Test Bot",
        user_id: "user_test123",
        status: "ready",
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockChatbot, error: null }),
      });

      const response = await request(app)
        .get("/api/chatbots/chatbot_test123")
        .set("Authorization", "Bearer test-token");

      expect(response.status).toBe(200);
    });

    it("should return 404 for non-existent chatbot", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      });

      const response = await request(app)
        .get("/api/chatbots/nonexistent")
        .set("Authorization", "Bearer test-token");

      expect(response.status).toBe(404);
    });
  });


  describe("PATCH /api/chatbots/:id", () => {
    it("should return 404 for non-existent chatbot", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      });

      const response = await request(app)
        .patch("/api/chatbots/nonexistent")
        .set("Authorization", "Bearer test-token")
        .send({
          name: "Updated Bot",
        });

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/chatbots/:id", () => {
    it("should return 404 for non-existent chatbot", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      });

      const response = await request(app)
        .delete("/api/chatbots/nonexistent")
        .set("Authorization", "Bearer test-token");

      expect(response.status).toBe(404);
    });
  });

});
