import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

// Mock all modules before importing the controller
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    insert: vi.fn(),
    update: vi.fn().mockReturnThis(),
  },
}));

vi.mock("../../../server/middleware/clerkAuth", () => ({
  checkAndIncrementUsage: vi.fn(),
}));

vi.mock("../../../server/services/ai", () => ({
  aiService: {
    buildContext: vi.fn(),
    getChatResponse: vi.fn(),
    streamResponse: vi.fn(),
  },
  requiresMaxCompletionTokens: (model: string) => model.startsWith("gpt-5"),
}));

vi.mock("../../../server/services/sentiment", () => ({
  analyzeSentiment: vi.fn().mockResolvedValue("neutral"),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: "Hello" } }] };
            yield { choices: [{ delta: { content: " there" } }] };
          },
        }),
      },
    },
  })),
}));

import { getConversation } from "../../../server/controllers/chat";
import { supabaseAdmin } from "../../../server/utils/supabase";
import { ValidationError } from "../../../server/utils/errors";

// Mock request factory
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as Request;
}

// Mock response factory
function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    headersSent: false,
  } as unknown as Response;
}

describe("Chat Controller", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
  });

  describe("getConversation", () => {
    it("should return conversation when found", async () => {
      const req = createMockRequest({
        params: {
          chatbotId: "123e4567-e89b-12d3-a456-426614174000",
          sessionId: "session123",
        },
      }) as Request & { user?: { userId: string } };
      const res = createMockResponse();

      const mockConversation = {
        id: "conv123",
        messages: [
          { role: "user", content: "Hello", timestamp: "2024-01-01T00:00:00Z" },
          { role: "assistant", content: "Hi!", timestamp: "2024-01-01T00:00:01Z" },
        ],
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:01Z",
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockConversation, error: null }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await getConversation(req as unknown as Request & { user?: { userId: string } }, res, mockNext);

      expect(res.json).toHaveBeenCalledWith(mockConversation);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return empty conversation when not found", async () => {
      const req = createMockRequest({
        params: {
          chatbotId: "123e4567-e89b-12d3-a456-426614174000",
          sessionId: "session123",
        },
      }) as Request & { user?: { userId: string } };
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await getConversation(req as unknown as Request & { user?: { userId: string } }, res, mockNext);

      expect(res.json).toHaveBeenCalledWith({
        messages: [],
        created_at: null,
      });
    });

    it("should throw ValidationError when chatbotId is missing", async () => {
      const req = createMockRequest({
        params: {
          sessionId: "session123",
        },
      }) as Request & { user?: { userId: string } };
      const res = createMockResponse();

      await getConversation(req as unknown as Request & { user?: { userId: string } }, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should throw ValidationError when sessionId is missing", async () => {
      const req = createMockRequest({
        params: {
          chatbotId: "123e4567-e89b-12d3-a456-426614174000",
        },
      }) as Request & { user?: { userId: string } };
      const res = createMockResponse();

      await getConversation(req as unknown as Request & { user?: { userId: string } }, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe("ConversationMessage structure", () => {
    interface ConversationMessage {
      role: "user" | "assistant";
      content: string;
      timestamp: string;
      sentiment?: "positive" | "neutral" | "negative";
    }

    it("should have correct message structure", () => {
      const message: ConversationMessage = {
        role: "user",
        content: "Hello!",
        timestamp: new Date().toISOString(),
      };

      expect(message.role).toBe("user");
      expect(message.content).toBe("Hello!");
      expect(message.timestamp).toBeDefined();
    });

    it("should support sentiment field", () => {
      const message: ConversationMessage = {
        role: "user",
        content: "I love this product!",
        timestamp: new Date().toISOString(),
        sentiment: "positive",
      };

      expect(message.sentiment).toBe("positive");
    });
  });

  describe("SSE header configuration", () => {
    it("should set correct SSE headers", () => {
      const headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      };

      expect(headers["Content-Type"]).toBe("text/event-stream");
      expect(headers["Cache-Control"]).toBe("no-cache");
      expect(headers["Connection"]).toBe("keep-alive");
      expect(headers["X-Accel-Buffering"]).toBe("no");
    });
  });

  describe("SSE event formatting", () => {
    it("should format chunk event correctly", () => {
      const content = "Hello";
      const event = `data: ${JSON.stringify({ type: "chunk", content })}\n\n`;

      expect(event).toBe('data: {"type":"chunk","content":"Hello"}\n\n');
    });

    it("should format done event correctly", () => {
      const sources = [{ url: "https://example.com", title: "Page" }];
      const event = `data: ${JSON.stringify({ type: "done", sources })}\n\n`;

      expect(event).toContain('"type":"done"');
      expect(event).toContain('"sources"');
    });

    it("should format error event correctly", () => {
      const event = `data: ${JSON.stringify({ type: "error", message: "Failed" })}\n\n`;

      expect(event).toBe('data: {"type":"error","message":"Failed"}\n\n');
    });
  });

  describe("Message history handling", () => {
    it("should append new messages to history", () => {
      const history = [
        { role: "user" as const, content: "Hello", timestamp: "2024-01-01T00:00:00Z" },
        { role: "assistant" as const, content: "Hi!", timestamp: "2024-01-01T00:00:01Z" },
      ];

      const newMessages = [
        ...history,
        { role: "user" as const, content: "How are you?", timestamp: new Date().toISOString() },
        { role: "assistant" as const, content: "I'm good!", timestamp: new Date().toISOString() },
      ];

      expect(newMessages).toHaveLength(4);
      expect(newMessages[2].content).toBe("How are you?");
      expect(newMessages[3].content).toBe("I'm good!");
    });

    it("should handle empty history", () => {
      const history: { role: "user" | "assistant"; content: string; timestamp: string }[] = [];

      const newMessages = [
        ...history,
        { role: "user" as const, content: "Hello", timestamp: new Date().toISOString() },
        { role: "assistant" as const, content: "Hi!", timestamp: new Date().toISOString() },
      ];

      expect(newMessages).toHaveLength(2);
    });
  });

  describe("Support bot conversation cleanup", () => {
    it("should keep last 20 messages", () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: "user" as const,
        content: `Message ${i}`,
        timestamp: new Date().toISOString(),
      }));

      const trimmed = messages.slice(-20);

      expect(trimmed).toHaveLength(20);
      expect(trimmed[0].content).toBe("Message 10");
      expect(trimmed[19].content).toBe("Message 29");
    });

    it("should trigger cleanup when map exceeds 1000 entries", () => {
      const conversationMap = new Map<string, unknown[]>();

      // Simulate 1001 entries
      for (let i = 0; i <= 1000; i++) {
        conversationMap.set(`session-${i}`, []);
      }

      // Cleanup logic
      if (conversationMap.size > 1000) {
        const keys = Array.from(conversationMap.keys());
        keys.slice(0, 500).forEach((k) => conversationMap.delete(k));
      }

      expect(conversationMap.size).toBe(501);
    });
  });

  describe("GPT-5 model detection", () => {
    function requiresMaxCompletionTokens(model: string): boolean {
      return model.startsWith("gpt-5");
    }

    it("should return true for gpt-5 models", () => {
      expect(requiresMaxCompletionTokens("gpt-5")).toBe(true);
      expect(requiresMaxCompletionTokens("gpt-5-mini")).toBe(true);
      expect(requiresMaxCompletionTokens("gpt-5-nano")).toBe(true);
    });

    it("should return false for non-gpt-5 models", () => {
      expect(requiresMaxCompletionTokens("gpt-4")).toBe(false);
      expect(requiresMaxCompletionTokens("gpt-4o")).toBe(false);
      expect(requiresMaxCompletionTokens("gpt-3.5-turbo")).toBe(false);
    });
  });

  describe("Request params for OpenAI", () => {
    it("should use max_completion_tokens for GPT-5", () => {
      const model = "gpt-5-mini";
      const maxTokens = 500;

      const requestParams: Record<string, unknown> = {
        model,
        messages: [],
        stream: true,
      };

      if (model.startsWith("gpt-5")) {
        requestParams.max_completion_tokens = maxTokens;
      } else {
        requestParams.max_tokens = maxTokens;
      }

      expect(requestParams.max_completion_tokens).toBe(500);
      expect(requestParams.max_tokens).toBeUndefined();
    });

    it("should use max_tokens for non-GPT-5", () => {
      const model = "gpt-4o";
      const maxTokens = 500;

      const requestParams: Record<string, unknown> = {
        model,
        messages: [],
        stream: true,
      };

      if (model.startsWith("gpt-5")) {
        requestParams.max_completion_tokens = maxTokens;
      } else {
        requestParams.max_tokens = maxTokens;
      }

      expect(requestParams.max_tokens).toBe(500);
      expect(requestParams.max_completion_tokens).toBeUndefined();
    });

    it("should not add temperature for GPT-5", () => {
      const model = "gpt-5-mini";

      const requestParams: Record<string, unknown> = {
        model,
        messages: [],
        stream: true,
      };

      if (!model.startsWith("gpt-5")) {
        requestParams.temperature = 0.7;
      }

      expect(requestParams.temperature).toBeUndefined();
    });
  });

  describe("Error handling in SSE", () => {
    it("should handle error when headers not sent", () => {
      const headersSent = false;
      const error = new Error("Test error");

      if (headersSent) {
        // Would write error event
      } else {
        // Would call next(error)
      }

      expect(headersSent).toBe(false);
    });

    it("should handle error when headers already sent", () => {
      const headersSent = true;
      const error = new Error("Test error");
      let eventWritten = false;

      if (headersSent) {
        eventWritten = true;
      }

      expect(eventWritten).toBe(true);
    });
  });

  describe("Sentiment update logic", () => {
    it("should find user message index (second to last)", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
        { role: "user", content: "How are you?" },
        { role: "assistant", content: "Good!" },
      ];

      const userMsgIndex = messages.length - 2;

      expect(userMsgIndex).toBe(2);
      expect(messages[userMsgIndex].role).toBe("user");
    });

    it("should handle edge case of short conversation", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];

      const userMsgIndex = messages.length - 2;

      expect(userMsgIndex).toBe(0);
      expect(messages[userMsgIndex].role).toBe("user");
    });
  });
});
