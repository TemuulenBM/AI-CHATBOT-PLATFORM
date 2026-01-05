import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express, { Express, Request, Response, NextFunction } from "express";
import request from "supertest";

// Set environment variables before any imports
process.env.CLERK_SECRET_KEY = "test-clerk-secret";
process.env.OPENAI_API_KEY = "test-openai-key";

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
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
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
  getCache: vi.fn().mockResolvedValue({
    plan: "starter",
    usage: { messages_count: 50, chatbots_count: 1 },
  }),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/services/ai", () => ({
  aiService: {
    buildContext: vi.fn().mockResolvedValue({
      relevantContent: "Test context content",
      sources: [{ url: "https://example.com/page", title: "Test Page" }],
    }),
    getChatResponse: vi.fn().mockResolvedValue("This is a test response from the AI."),
    streamResponse: vi.fn().mockImplementation(async function* () {
      yield "This is ";
      yield "a streamed ";
      yield "response.";
    }),
  },
  requiresMaxCompletionTokens: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../server/services/sentiment", () => ({
  analyzeSentiment: vi.fn().mockResolvedValue("positive"),
}));

vi.mock("openai", () => {
  const mockChat = {
    completions: {
      create: vi.fn().mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: "Hello " } }] };
          yield { choices: [{ delta: { content: "there!" } }] };
        },
      }),
    },
  };

  return {
    default: class {
      chat = mockChat;
      constructor() {
        return this;
      }
    },
  };
});

import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "../../../server/utils/supabase";

describe("Chat API Endpoints", () => {
  let app: Express;
  let getConversation: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let supportBotMessage: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let optionalClerkAuthMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;

  beforeAll(async () => {
    const controllers = await import("../../../server/controllers/chat");
    getConversation = controllers.getConversation;
    supportBotMessage = controllers.supportBotMessage;

    const middleware = await import("../../../server/middleware/clerkAuth");
    optionalClerkAuthMiddleware = middleware.optionalClerkAuthMiddleware;
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Setup routes
    app.get("/api/chat/:chatbotId/:sessionId", optionalClerkAuthMiddleware, getConversation);
    app.post("/api/chat/support", supportBotMessage);

    // Error handler
    app.use((err: Error & { statusCode?: number }, req: Request, res: Response, next: NextFunction) => {
      res.status(err.statusCode || 500).json({ message: err.message });
    });

    vi.clearAllMocks();
    (verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({ sub: "user_test123" });
  });

  describe("GET /api/chat/:chatbotId/:sessionId", () => {
    it("should return conversation history", async () => {
      const mockMessages = [
        { role: "user", content: "Hello", timestamp: new Date().toISOString() },
        { role: "assistant", content: "Hi there!", timestamp: new Date().toISOString() },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "conv_test123",
            messages: mockMessages,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          error: null,
        }),
      });

      const response = await request(app)
        .get("/api/chat/chatbot_test123/session_test123");

      expect(response.status).toBe(200);
      expect(response.body.messages).toEqual(mockMessages);
    });

    it("should return empty conversation for new session", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        }),
      });

      const response = await request(app)
        .get("/api/chat/chatbot_test123/new_session");

      expect(response.status).toBe(200);
      expect(response.body.messages).toEqual([]);
    });
  });

  describe("POST /api/chat/support", () => {
    it("should require message in request body", async () => {
      const response = await request(app)
        .post("/api/chat/support")
        .send({
          sessionId: "anon_session",
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Message is required");
    });

    it("should reject empty message", async () => {
      const response = await request(app)
        .post("/api/chat/support")
        .send({
          sessionId: "anon_session",
          message: "",
        });

      expect(response.status).toBe(400);
    });
  });
});
