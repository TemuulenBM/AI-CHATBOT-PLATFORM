import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "express";
import request from "supertest";
import express from "express";
import chatRoutes from "../../../server/routes/chat";

// Mock all dependencies
vi.mock("../../../server/controllers/chat", () => ({
  supportBotMessage: vi.fn((req, res, next) => {
    res.status(200).json({ message: "Support response" });
  }),
  sendMessage: vi.fn((req, res, next) => {
    res.status(200).json({ message: "Response", conversation_id: "conv-123" });
  }),
  streamMessage: vi.fn((req, res, next) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.status(200).write("data: test\n\n");
    res.end();
  }),
  getConversation: vi.fn((req, res, next) => {
    res.status(200).json({ messages: [] });
  }),
}));

vi.mock("../../../server/controllers/chatbots", () => ({
  getChatbotPublic: vi.fn((req, res, next) => {
    res.status(200).json({ id: req.params.id });
  }),
}));

vi.mock("../../../server/middleware/validation", () => ({
  validate: vi.fn(() => (req: any, res: any, next: any) => next()),
  schemas: {
    chatMessage: {},
    uuidParam: {},
  },
}));

vi.mock("../../../server/middleware/rateLimit", () => ({
  chatRateLimit: vi.fn((req: any, res: any, next: any) => next()),
  apiRateLimit: vi.fn((req: any, res: any, next: any) => next()),
}));

vi.mock("../../../server/middleware/usage-monitor", () => ({
  checkUsageLimits: vi.fn((req: any, res: any, next: any) => next()),
}));

describe("Chat Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/chat", chatRoutes);
    vi.clearAllMocks();
  });

  describe("POST /api/chat/support", () => {
    it("should handle support bot message", async () => {
      const response = await request(app)
        .post("/api/chat/support")
        .send({ message: "Hello", sessionId: "session-123" });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Support response");
    });
  });

  describe("POST /api/chat/message", () => {
    it("should handle chat message", async () => {
      const response = await request(app)
        .post("/api/chat/message")
        .send({
          chatbot_id: "chatbot-123",
          session_id: "session-123",
          message: "Hello",
        });

      expect(response.status).toBe(200);
      expect(response.body.conversation_id).toBe("conv-123");
    });
  });

  describe("POST /api/chat/stream", () => {
    it("should handle streaming chat message", async () => {
      const response = await request(app)
        .post("/api/chat/stream")
        .send({
          chatbot_id: "chatbot-123",
          session_id: "session-123",
          message: "Hello",
        });

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");
    });
  });

  describe("GET /api/chat/widget/:id", () => {
    it("should get chatbot public info", async () => {
      const response = await request(app).get("/api/chat/widget/chatbot-123");

      expect(response.status).toBe(200);
      expect(response.body.id).toBe("chatbot-123");
    });
  });

  describe("GET /api/chat/:chatbotId/:sessionId", () => {
    it("should get conversation history", async () => {
      const response = await request(app).get(
        "/api/chat/chatbot-123/session-123"
      );

      expect(response.status).toBe(200);
      expect(response.body.messages).toEqual([]);
    });
  });
});

