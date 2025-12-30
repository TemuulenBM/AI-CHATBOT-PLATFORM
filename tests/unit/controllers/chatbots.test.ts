import { describe, it, expect, vi, beforeEach } from "vitest";
import { Response, NextFunction } from "express";
import {
  createChatbot,
  listChatbots,
  getChatbot,
  updateChatbot,
  deleteChatbot,
  getStats,
  getMessageVolume,
  getConversationTrends,
  getTopQuestions,
  getChatbotAnalytics,
  getSentimentBreakdown,
} from "../../../server/controllers/chatbots";
import { AuthorizationError, NotFoundError } from "../../../server/utils/errors";
import { AuthenticatedRequest } from "../../../server/middleware/clerkAuth";

// Mock dependencies
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock("../../../server/middleware/clerkAuth", () => ({
  checkAndIncrementUsage: vi.fn().mockResolvedValue(undefined),
  decrementUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/utils/redis", () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
  deleteCachePattern: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/jobs/queues", () => ({
  scrapeQueue: {
    add: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../server/services/analytics", () => ({
  getDashboardStats: vi.fn().mockResolvedValue({
    totalChatbots: 5,
    totalConversations: 100,
    totalMessages: 500,
  }),
  getMessageVolumeByDay: vi.fn().mockResolvedValue([]),
  getConversationTrends: vi.fn().mockResolvedValue([]),
  getTopQuestions: vi.fn().mockResolvedValue([]),
  getChatbotAnalytics: vi.fn().mockResolvedValue({}),
  getSentimentBreakdown: vi.fn().mockResolvedValue({ positive: 0, neutral: 0, negative: 0 }),
}));

import { supabaseAdmin } from "../../../server/utils/supabase";
import { getCache } from "../../../server/utils/redis";
import * as analyticsService from "../../../server/services/analytics";

// Helper factories
function createMockRequest(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    body: {},
    params: {},
    query: {},
    user: { userId: "user123" },
    ...overrides,
  } as AuthenticatedRequest;
}

function createMockResponse(): Response & { _json: any; _status: number } {
  const res = {
    _json: null,
    _status: 200,
    status: vi.fn(function (code: number) {
      res._status = code;
      return res;
    }),
    json: vi.fn(function (data: any) {
      res._json = data;
      return res;
    }),
  } as unknown as Response & { _json: any; _status: number };
  return res;
}

function createMockQueryBuilder(options: {
  selectData?: any;
  selectError?: any;
  insertData?: any;
  insertError?: any;
  updateData?: any;
  updateError?: any;
  deleteError?: any;
  count?: number;
} = {}) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.selectData ?? null,
      error: options.selectError ?? null,
    }),
  };

  // Make select chainable with count
  builder.select.mockImplementation(() => ({
    ...builder,
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({
      data: options.selectData ?? [],
      error: options.selectError ?? null,
      count: options.count ?? 0,
    }),
    single: vi.fn().mockResolvedValue({
      data: options.selectData ?? null,
      error: options.selectError ?? null,
    }),
  }));

  builder.insert.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: options.insertData ?? null,
        error: options.insertError ?? null,
      }),
    }),
  }));

  builder.update.mockImplementation(() => ({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: options.updateData ?? null,
          error: options.updateError ?? null,
        }),
      }),
    }),
  }));

  builder.delete.mockImplementation(() => ({
    eq: vi.fn().mockResolvedValue({
      error: options.deleteError ?? null,
    }),
  }));

  return builder;
}

describe("Chatbots Controller", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe("createChatbot", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await createChatbot(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should create chatbot successfully", async () => {
      const chatbotData = {
        id: "chatbot123",
        name: "Test Chatbot",
        website_url: "https://example.com",
        status: "ready",
      };

      const builder = createMockQueryBuilder({
        insertData: chatbotData,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        body: {
          name: "Test Chatbot",
          websiteUrl: "https://example.com",
          settings: { personality: 50 },
        },
      });
      const res = createMockResponse();

      await createChatbot(req, res, mockNext);

      expect(res._status).toBe(201);
      expect(res._json).toHaveProperty("chatbot");
      expect(res._json.chatbot.name).toBe("Test Chatbot");
    });
  });

  describe("listChatbots", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await listChatbots(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should return cached data when available", async () => {
      const cachedData = {
        chatbots: [{ id: "1" }, { id: "2" }],
        total: 2,
      };
      vi.mocked(getCache).mockResolvedValue(cachedData);

      const req = createMockRequest({
        query: { page: "1", limit: "10" },
      });
      const res = createMockResponse();

      await listChatbots(req, res, mockNext);

      expect(res._json).toEqual(cachedData);
    });

    it("should paginate results correctly", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const builder = createMockQueryBuilder({
        selectData: [{ id: "1" }],
        count: 25,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        query: { page: "2", limit: "10" },
      });
      const res = createMockResponse();

      await listChatbots(req, res, mockNext);

      expect(res._json).toHaveProperty("page", 2);
      expect(res._json).toHaveProperty("limit", 10);
    });

    it("should limit max results to 50", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const builder = createMockQueryBuilder({
        selectData: [],
        count: 0,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        query: { page: "1", limit: "100" }, // Request 100 but should be capped
      });
      const res = createMockResponse();

      await listChatbots(req, res, mockNext);

      expect(res._json).toHaveProperty("limit", 50);
    });
  });

  describe("getChatbot", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getChatbot(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw NotFoundError when chatbot does not exist", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const builder = createMockQueryBuilder({
        selectData: null,
        selectError: { message: "Not found" },
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { id: "nonexistent" },
      });
      const res = createMockResponse();

      await getChatbot(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("should return cached chatbot when available", async () => {
      const cachedChatbot = {
        id: "chatbot123",
        name: "Cached Chatbot",
        stats: { embeddings: 10, conversations: 5 },
      };
      vi.mocked(getCache).mockResolvedValue(cachedChatbot);

      const req = createMockRequest({
        params: { id: "chatbot123" },
      });
      const res = createMockResponse();

      await getChatbot(req, res, mockNext);

      expect(res._json).toEqual(cachedChatbot);
    });
  });

  describe("updateChatbot", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await updateChatbot(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw NotFoundError when chatbot does not exist", async () => {
      const fetchBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(fetchBuilder as any);

      const req = createMockRequest({
        params: { id: "nonexistent" },
        body: { name: "New Name" },
      });
      const res = createMockResponse();

      await updateChatbot(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  describe("deleteChatbot", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await deleteChatbot(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw NotFoundError when chatbot does not exist", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { id: "nonexistent" },
      });
      const res = createMockResponse();

      await deleteChatbot(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  describe("getStats", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getStats(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should return dashboard stats", async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await getStats(req, res, mockNext);

      expect(res._json).toHaveProperty("totalChatbots", 5);
      expect(res._json).toHaveProperty("totalConversations", 100);
      expect(res._json).toHaveProperty("totalMessages", 500);
    });
  });

  describe("getMessageVolume", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getMessageVolume(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should use default 7 days when not specified", async () => {
      const req = createMockRequest({
        query: {},
      });
      const res = createMockResponse();

      await getMessageVolume(req, res, mockNext);

      expect(analyticsService.getMessageVolumeByDay).toHaveBeenCalledWith("user123", 7);
    });

    it("should limit days to max 30", async () => {
      const req = createMockRequest({
        query: { days: "100" },
      });
      const res = createMockResponse();

      await getMessageVolume(req, res, mockNext);

      expect(analyticsService.getMessageVolumeByDay).toHaveBeenCalledWith("user123", 30);
    });

    it("should limit days to min 1", async () => {
      const req = createMockRequest({
        query: { days: "-5" },
      });
      const res = createMockResponse();

      await getMessageVolume(req, res, mockNext);

      // Math.min(Math.max(-5, 1), 30) = Math.min(1, 30) = 1
      expect(analyticsService.getMessageVolumeByDay).toHaveBeenCalledWith("user123", 1);
    });
  });

  describe("getConversationTrends", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getConversationTrends(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw NotFoundError when chatbot does not exist", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { id: "nonexistent" },
      });
      const res = createMockResponse();

      await getConversationTrends(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  describe("getTopQuestions", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getTopQuestions(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should use default limit of 10 when not specified", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "chatbot123" }, error: null }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { id: "chatbot123" },
        query: {},
      });
      const res = createMockResponse();

      await getTopQuestions(req, res, mockNext);

      expect(analyticsService.getTopQuestions).toHaveBeenCalledWith("chatbot123", 10);
    });

    it("should limit to max 50 questions", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "chatbot123" }, error: null }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { id: "chatbot123" },
        query: { limit: "100" },
      });
      const res = createMockResponse();

      await getTopQuestions(req, res, mockNext);

      expect(analyticsService.getTopQuestions).toHaveBeenCalledWith("chatbot123", 50);
    });
  });

  describe("getChatbotAnalytics", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getChatbotAnalytics(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should return analytics with chatbot name", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "chatbot123", name: "My Chatbot" },
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);
      vi.mocked(analyticsService.getChatbotAnalytics).mockResolvedValue({
        totalConversations: 50,
        avgMessagesPerConversation: 5,
      });

      const req = createMockRequest({
        params: { id: "chatbot123" },
      });
      const res = createMockResponse();

      await getChatbotAnalytics(req, res, mockNext);

      expect(res._json).toHaveProperty("name", "My Chatbot");
      expect(res._json).toHaveProperty("totalConversations", 50);
    });
  });

  describe("getSentimentBreakdown", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getSentimentBreakdown(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should return sentiment breakdown", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "chatbot123" },
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);
      vi.mocked(analyticsService.getSentimentBreakdown).mockResolvedValue({
        positive: 60,
        neutral: 30,
        negative: 10,
      });

      const req = createMockRequest({
        params: { id: "chatbot123" },
      });
      const res = createMockResponse();

      await getSentimentBreakdown(req, res, mockNext);

      expect(res._json).toEqual({
        positive: 60,
        neutral: 30,
        negative: 10,
      });
    });
  });
});
