import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import chatbotsRoutes from "../../../server/routes/chatbots";

// Mock all dependencies
vi.mock("../../../server/controllers/chatbots", () => {
  const mockController = (req: any, res: any) => res.status(200).json({ success: true });
  const mockControllerWithId = (req: any, res: any) => res.status(200).json({ id: req.params.id });
  
  return {
    getStats: vi.fn((req, res) => res.status(200).json({ total_chatbots: 5 })),
    getMessageVolume: vi.fn((req, res) => res.status(200).json({ volume: [] })),
    getAllConversations: vi.fn((req, res) => res.status(200).json({ conversations: [] })),
    listChatbots: vi.fn((req, res) => res.status(200).json({ chatbots: [] })),
    createChatbot: vi.fn((req, res) => res.status(201).json({ id: "chatbot-123" })),
    getChatbot: mockControllerWithId,
    getChatbotAnalytics: mockController,
    getWidgetAnalytics: mockController,
    getSentimentBreakdown: mockController,
    getConversationTrends: mockController,
    getTopQuestions: mockController,
    getConversations: mockController,
    getConversation: mockController,
    updateChatbot: mockControllerWithId,
    deleteChatbot: vi.fn((req, res) => res.status(200).json({ success: true })),
    triggerRescrape: mockController,
    updateScrapeSchedule: mockController,
    getScrapeHistory: mockController,
    getResponseTimeTrends: mockController,
    getConversationRate: mockController,
    exportAnalytics: mockController,
  };
});

vi.mock("../../../server/controllers/knowledge-base", () => {
  const mockKBController = (req: any, res: any) => res.status(200).json({ success: true });
  const mockControllerWithId = (req: any, res: any) => res.status(200).json({ id: req.params.id });
  
  return {
    getKnowledgeStats: mockKBController,
    bulkImportKnowledge: mockKBController,
    addKnowledgeEntry: vi.fn((req, res) => res.status(201).json({ id: "kb-123" })),
    listKnowledgeEntries: vi.fn((req, res) => res.status(200).json({ entries: [] })),
    getKnowledgeEntry: mockControllerWithId,
    updateKnowledgeEntry: mockControllerWithId,
    deleteKnowledgeEntry: vi.fn((req, res) => res.status(200).json({ success: true })),
  };
});

vi.mock("../../../server/middleware/validation", () => ({
  validate: vi.fn(() => (req: any, res: any, next: any) => next()),
  schemas: {
    createChatbot: {},
    updateChatbot: {},
    uuidParam: {},
  },
}));

vi.mock("../../../server/middleware/clerkAuth", () => ({
  clerkAuthMiddleware: vi.fn((req: any, res: any, next: any) => {
    req.user = { userId: "user-123" };
    next();
  }),
  loadSubscription: vi.fn((req: any, res: any, next: any) => next()),
}));

vi.mock("../../../server/middleware/rateLimit", () => ({
  embeddingRateLimit: vi.fn((req: any, res: any, next: any) => next()),
}));

describe("Chatbots Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/chatbots", chatbotsRoutes);
    vi.clearAllMocks();
  });

  describe("GET /api/chatbots/stats", () => {
    it("should get dashboard statistics", async () => {
      const response = await request(app).get("/api/chatbots/stats");

      expect(response.status).toBe(200);
      expect(response.body.total_chatbots).toBe(5);
    });
  });

  describe("GET /api/chatbots/stats/volume", () => {
    it("should get message volume", async () => {
      const response = await request(app).get("/api/chatbots/stats/volume");

      expect(response.status).toBe(200);
      expect(response.body.volume).toEqual([]);
    });
  });

  describe("GET /api/chatbots/conversations", () => {
    it("should get all conversations", async () => {
      const response = await request(app).get("/api/chatbots/conversations");

      expect(response.status).toBe(200);
      expect(response.body.conversations).toEqual([]);
    });
  });

  describe("POST /api/chatbots", () => {
    it("should create a chatbot", async () => {
      const response = await request(app)
        .post("/api/chatbots")
        .send({ name: "Test Bot", website_url: "https://example.com" });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe("chatbot-123");
    });
  });

  describe("GET /api/chatbots", () => {
    it("should get all chatbots", async () => {
      const response = await request(app).get("/api/chatbots");

      expect(response.status).toBe(200);
      expect(response.body.chatbots).toEqual([]);
    });
  });

  describe("GET /api/chatbots/:id", () => {
    it("should get a specific chatbot", async () => {
      const response = await request(app).get("/api/chatbots/chatbot-123");

      expect(response.status).toBe(200);
      expect(response.body.id).toBe("chatbot-123");
    });
  });

  describe("PATCH /api/chatbots/:id", () => {
    it("should update a chatbot", async () => {
      const response = await request(app)
        .patch("/api/chatbots/chatbot-123")
        .send({ name: "Updated Bot" });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe("chatbot-123");
    });
  });

  describe("DELETE /api/chatbots/:id", () => {
    it("should delete a chatbot", async () => {
      const response = await request(app).delete("/api/chatbots/chatbot-123");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

