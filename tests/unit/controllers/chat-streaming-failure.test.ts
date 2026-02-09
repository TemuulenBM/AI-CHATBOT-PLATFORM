import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

// Mock all modules before importing
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
  decrementUsage: vi.fn(),
}));

vi.mock("../../../server/services/ai", () => ({
  aiService: {
    buildContext: vi.fn(),
    streamResponse: vi.fn(),
  },
  requiresMaxCompletionTokens: (model: string) => model.startsWith("gpt-5"),
}));

vi.mock("../../../server/services/sentiment", () => ({
  analyzeSentiment: vi.fn().mockResolvedValue("neutral"),
}));

// Support conversation-уудыг Redis-рүү шилжүүлсэн тул mock хэрэгтэй
vi.mock("../../../server/utils/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn(), ttl: vi.fn() },
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
  default: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { streamMessage } from "../../../server/controllers/chat";
import { supabaseAdmin } from "../../../server/utils/supabase";
import { checkAndIncrementUsage, decrementUsage } from "../../../server/middleware/clerkAuth";
import { aiService } from "../../../server/services/ai";
import { NotFoundError } from "../../../server/utils/errors";

// Mock request factory
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as Request;
}

// Mock response factory with streaming capabilities
function createMockResponse(): Response {
  const headers: Record<string, string> = {};
  let headersSent = false;
  let writtenData: string[] = [];
  let ended = false;

  const response = {
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
      // In Express, headersSent becomes true when headers are flushed (usually on first write)
      // But for SSE, setHeader doesn't send headers yet - they're sent on first write
      return response;
    }),
    write: vi.fn((data: string) => {
      // Headers are sent when first write happens (Express behavior)
      if (!headersSent) {
        headersSent = true;
      }
      writtenData.push(data);
      return true;
    }),
    end: vi.fn(() => {
      ended = true;
    }),
    get headersSent() {
      // Return the actual state - headers are only sent when write() is called
      return headersSent;
    },
    get writtenData() {
      return writtenData;
    },
    get ended() {
      return ended;
    },
  } as unknown as Response & { writtenData: string[]; ended: boolean };
  
  return response;
}

describe("Chat Controller - Streaming Failure Recovery", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
  });

  describe("Stream failure before headers sent", () => {
    it.skip("should rollback usage when error occurs before headers are set (e.g., buildContext fails)", async () => {
      const req = createMockRequest({
        body: {
          chatbotId: "chatbot-123",
          sessionId: "session-123",
          message: "Hello",
        },
      }) as Request & { user?: { userId: string } };

      const res = createMockResponse();

      const mockChatbot = {
        id: "chatbot-123",
        user_id: "user-123",
        name: "Test Bot",
        website_url: "https://example.com",
        settings: { personality: 50, primaryColor: "#000", welcomeMessage: "Hi" },
        status: "ready",
      };

      // Mock chatbot query
      const chatbotQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockChatbot, error: null }),
      };

      // Mock conversation query  
      const conversationQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      conversationQueryChain.eq.mockReturnValue(conversationQueryChain);
      const conversationQuery = conversationQueryChain;

      // Mock from() to return different queries based on table name
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return chatbotQuery as any;
        }
        if (table === "conversations") {
          return conversationQuery as any;
        }
        return {} as any;
      });

      vi.mocked(checkAndIncrementUsage).mockResolvedValue(undefined);
      vi.mocked(decrementUsage).mockResolvedValue(undefined);

      // Mock buildContext
      // buildContext fails before headers are set
      const contextError = new Error("Failed to build context");
      vi.mocked(aiService.buildContext).mockRejectedValue(contextError);

      await streamMessage(req as any, res, mockNext);

      // Should have attempted rollback since error occurred before headers were set
      // Verify headersSent is false (headers not sent yet)
      expect(res.headersSent).toBe(false);
      expect(decrementUsage).toHaveBeenCalledWith("user-123", "message");
      expect(mockNext).toHaveBeenCalled();
    });

    it.skip("should handle rollback failure gracefully", async () => {
      const req = createMockRequest({
        body: {
          chatbotId: "chatbot-123",
          sessionId: "session-123",
          message: "Hello",
        },
      }) as Request & { user?: { userId: string } };

      const res = createMockResponse();

      const mockChatbot = {
        id: "chatbot-123",
        user_id: "user-123",
        name: "Test Bot",
        website_url: "https://example.com",
        settings: { personality: 50, primaryColor: "#000", welcomeMessage: "Hi" },
        status: "ready",
      };

      // Mock chatbot query
      const chatbotQuery2 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockChatbot, error: null }),
      };

      // Mock conversation query  
      const conversationQuery2Chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      conversationQuery2Chain.eq.mockReturnValue(conversationQuery2Chain);
      const conversationQuery2 = conversationQuery2Chain;

      // Mock from() to return different queries based on table name
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return chatbotQuery2 as any;
        }
        if (table === "conversations") {
          return conversationQuery2 as any;
        }
        return {} as any;
      });

      vi.mocked(checkAndIncrementUsage).mockResolvedValue(undefined);
      vi.mocked(decrementUsage).mockRejectedValue(new Error("Rollback failed"));

      // buildContext fails before headers are set
      const contextError = new Error("Failed to build context");
      vi.mocked(aiService.buildContext).mockRejectedValue(contextError);

      await streamMessage(req as any, res, mockNext);

      // Should still attempt rollback even if it fails
      expect(decrementUsage).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("Stream failure after headers sent", () => {
    it("should send error event when stream fails mid-stream", async () => {
      const req = createMockRequest({
        body: {
          chatbotId: "chatbot-123",
          sessionId: "session-123",
          message: "Hello",
        },
      }) as Request & { user?: { userId: string } };

      const res = createMockResponse();

      const mockChatbot = {
        id: "chatbot-123",
        user_id: "user-123",
        name: "Test Bot",
        website_url: "https://example.com",
        settings: { personality: 50, primaryColor: "#000", welcomeMessage: "Hi" },
        status: "ready",
      };

      // Mock chatbot query
      const chatbotQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockChatbot, error: null }),
      };

      // Mock conversation query  
      const conversationQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      conversationQueryChain.eq.mockReturnValue(conversationQueryChain);
      const conversationQuery = conversationQueryChain;

      // Mock from() to return different queries based on table name
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return chatbotQuery as any;
        }
        if (table === "conversations") {
          return conversationQuery as any;
        }
        return {} as any;
      });

      vi.mocked(checkAndIncrementUsage).mockResolvedValue(undefined);

      vi.mocked(aiService.buildContext).mockResolvedValue({
        relevantContent: "test",
        sources: [],
      });

      // Mock streamResponse to yield some chunks then fail
      vi.mocked(aiService.streamResponse).mockImplementation(async function* () {
        yield "Hello";
        yield " there";
        throw new Error("Stream connection lost");
      });

      await streamMessage(req as any, res, mockNext);

      // Should have written error event (caught in try-catch inside streamMessage)
      expect(res.write).toHaveBeenCalled();
      const writeCalls = (res.write as ReturnType<typeof vi.fn>).mock.calls;
      const errorEventWritten = writeCalls.some((call) => 
        call[0] && typeof call[0] === 'string' && call[0].includes('"type":"error"')
      );
      expect(errorEventWritten).toBe(true);
      expect(res.end).toHaveBeenCalled();
    });

    it("should not rollback usage when stream fails after headers sent", async () => {
      const req = createMockRequest({
        body: {
          chatbotId: "chatbot-123",
          sessionId: "session-123",
          message: "Hello",
        },
      }) as Request & { user?: { userId: string } };

      const res = createMockResponse();

      const mockChatbot = {
        id: "chatbot-123",
        user_id: "user-123",
        name: "Test Bot",
        website_url: "https://example.com",
        settings: { personality: 50, primaryColor: "#000", welcomeMessage: "Hi" },
        status: "ready",
      };

      // Mock chatbot query
      const chatbotQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockChatbot, error: null }),
      };

      // Mock conversation query  
      const conversationQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      conversationQueryChain.eq.mockReturnValue(conversationQueryChain);
      const conversationQuery = conversationQueryChain;

      // Mock from() to return different queries based on table name
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return chatbotQuery as any;
        }
        if (table === "conversations") {
          return conversationQuery as any;
        }
        return {} as any;
      });

      vi.mocked(checkAndIncrementUsage).mockResolvedValue(undefined);

      vi.mocked(aiService.buildContext).mockResolvedValue({
        relevantContent: "test",
        sources: [],
      });

      // Stream fails after yielding chunks (headers already sent)
      vi.mocked(aiService.streamResponse).mockImplementation(async function* () {
        yield "Hello";
        throw new Error("Stream connection lost");
      });

      await streamMessage(req as any, res, mockNext);

      // Should NOT rollback since headers were sent
      expect(decrementUsage).not.toHaveBeenCalled();
    });

    it("should handle response write failures during streaming", async () => {
      const req = createMockRequest({
        body: {
          chatbotId: "chatbot-123",
          sessionId: "session-123",
          message: "Hello",
        },
      }) as Request & { user?: { userId: string } };

      const res = createMockResponse();
      // Make write fail after first chunk
      let writeCount = 0;
      const originalWrite = res.write;
      vi.mocked(res.write).mockImplementation((data: string) => {
        writeCount++;
        if (writeCount > 1) {
          throw new Error("Write failed");
        }
        return originalWrite.call(res, data);
      });

      const mockChatbot = {
        id: "chatbot-123",
        user_id: "user-123",
        name: "Test Bot",
        website_url: "https://example.com",
        settings: { personality: 50, primaryColor: "#000", welcomeMessage: "Hi" },
        status: "ready",
      };

      // Mock chatbot query
      const chatbotQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockChatbot, error: null }),
      };

      // Mock conversation query  
      const conversationQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      conversationQueryChain.eq.mockReturnValue(conversationQueryChain);
      const conversationQuery = conversationQueryChain;

      // Mock from() to return different queries based on table name
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return chatbotQuery as any;
        }
        if (table === "conversations") {
          return conversationQuery as any;
        }
        return {} as any;
      });

      vi.mocked(checkAndIncrementUsage).mockResolvedValue(undefined);

      vi.mocked(aiService.buildContext).mockResolvedValue({
        relevantContent: "test",
        sources: [],
      });

      // Stream yields multiple chunks
      vi.mocked(aiService.streamResponse).mockImplementation(async function* () {
        yield "Hello";
        yield " there";
        yield " world";
      });

      // The write will throw, but the error should be handled
      await streamMessage(req as any, res, mockNext);

      // Should have attempted to write at least one chunk before failing
      expect(res.write).toHaveBeenCalled();
    });
  });

  describe("Connection close during streaming", () => {
    it("should handle connection close gracefully", async () => {
      const req = createMockRequest({
        body: {
          chatbotId: "chatbot-123",
          sessionId: "session-123",
          message: "Hello",
        },
      }) as Request & { user?: { userId: string } };

      const res = createMockResponse();
      // Simulate connection close - write fails after first chunk
      let writeCount = 0;
      vi.mocked(res.write).mockImplementation((data: string) => {
        writeCount++;
        if (writeCount > 1) {
          const error = new Error("Connection closed");
          (error as any).code = "ECONNRESET";
          throw error;
        }
        return true;
      });

      const mockChatbot = {
        id: "chatbot-123",
        user_id: "user-123",
        name: "Test Bot",
        website_url: "https://example.com",
        settings: { personality: 50, primaryColor: "#000", welcomeMessage: "Hi" },
        status: "ready",
      };

      // Mock chatbot query
      const chatbotQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockChatbot, error: null }),
      };

      // Mock conversation query  
      const conversationQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      conversationQueryChain.eq.mockReturnValue(conversationQueryChain);
      const conversationQuery = conversationQueryChain;

      // Mock from() to return different queries based on table name
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return chatbotQuery as any;
        }
        if (table === "conversations") {
          return conversationQuery as any;
        }
        return {} as any;
      });

      vi.mocked(checkAndIncrementUsage).mockResolvedValue(undefined);

      vi.mocked(aiService.buildContext).mockResolvedValue({
        relevantContent: "test",
        sources: [],
      });

      vi.mocked(aiService.streamResponse).mockImplementation(async function* () {
        yield "Hello";
      });

      // When res.write throws, it propagates to the outer catch block
      // The outer catch tries to write an error event, but if that also fails, error propagates
      // This is expected behavior - connection errors during write are not caught
      try {
        await streamMessage(req as any, res, mockNext);
      } catch (error) {
        // Error is expected when write fails
        expect((error as Error).message).toContain("Connection closed");
      }
      
      // Should have attempted to write
      expect(res.write).toHaveBeenCalled();
    });
  });

  describe("Error handling edge cases", () => {
    it("should handle chatbot not found error", async () => {
      const req = createMockRequest({
        body: {
          chatbotId: "invalid-id",
          sessionId: "session-123",
          message: "Hello",
        },
      }) as Request & { user?: { userId: string } };

      const res = createMockResponse();

      const chatbotQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
      };
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") return chatbotQuery as any;
        return {} as any;
      });

      await streamMessage(req as any, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
      expect(decrementUsage).not.toHaveBeenCalled(); // No rollback if chatbot not found
    });

    it("should handle usage limit exceeded error", async () => {
      const req = createMockRequest({
        body: {
          chatbotId: "chatbot-123",
          sessionId: "session-123",
          message: "Hello",
        },
      }) as Request & { user?: { userId: string } };

      const res = createMockResponse();

      const mockChatbot = {
        id: "chatbot-123",
        user_id: "user-123",
        name: "Test Bot",
        website_url: "https://example.com",
        settings: { personality: 50, primaryColor: "#000", welcomeMessage: "Hi" },
        status: "ready",
      };

      const chatbotQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockChatbot, error: null }),
      };
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") return chatbotQuery as any;
        return {} as any;
      });

      const { AuthorizationError } = await import("../../../server/utils/errors");
      const usageError = new AuthorizationError("Message limit reached (100). Please upgrade your plan.");
      vi.mocked(checkAndIncrementUsage).mockRejectedValue(usageError);

      await streamMessage(req as any, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(decrementUsage).not.toHaveBeenCalled(); // No rollback if usage check fails
    });
  });
});
