import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  submitFeedback,
  getSatisfactionMetrics,
  checkFeedback,
} from "../../../server/controllers/feedback";
import { ValidationError, NotFoundError } from "../../../server/utils/errors";

// Mock Supabase
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "../../../server/utils/supabase";

// Helper factories
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as Request;
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
} = {}) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.selectData ?? null,
      error: options.selectError ?? null,
    }),
  };

  // Handle insert().select().single() chain
  builder.insert.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: options.insertData ?? null,
        error: options.insertError ?? null,
      }),
    }),
  }));

  return builder;
}

describe("Feedback Controller", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe("submitFeedback", () => {
    it("should return ValidationError when conversationId is missing", async () => {
      const req = createMockRequest({
        body: {
          chatbotId: "chatbot123",
          rating: "positive",
        },
      });
      const res = createMockResponse();

      await submitFeedback(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should return ValidationError when chatbotId is missing", async () => {
      const req = createMockRequest({
        body: {
          conversationId: "conv123",
          rating: "positive",
        },
      });
      const res = createMockResponse();

      await submitFeedback(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should return ValidationError when rating is missing", async () => {
      const req = createMockRequest({
        body: {
          conversationId: "conv123",
          chatbotId: "chatbot123",
        },
      });
      const res = createMockResponse();

      await submitFeedback(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should return ValidationError for invalid rating value", async () => {
      const req = createMockRequest({
        body: {
          conversationId: "conv123",
          chatbotId: "chatbot123",
          rating: "invalid",
        },
      });
      const res = createMockResponse();

      await submitFeedback(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should accept positive rating", async () => {
      const conversationBuilder = createMockQueryBuilder({
        selectData: { id: "conv123" },
      });
      const feedbackCheckBuilder = createMockQueryBuilder({
        selectData: null, // No existing feedback
      });
      const feedbackInsertBuilder = createMockQueryBuilder({
        insertData: { id: "feedback123" },
      });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "conversations") {
          return conversationBuilder as any;
        }
        if (table === "feedback") {
          callCount++;
          if (callCount === 1) {
            return feedbackCheckBuilder as any;
          }
          return feedbackInsertBuilder as any;
        }
        return {} as any;
      });

      const req = createMockRequest({
        body: {
          conversationId: "conv123",
          chatbotId: "chatbot123",
          rating: "positive",
        },
      });
      const res = createMockResponse();

      await submitFeedback(req, res, mockNext);

      expect(res._status).toBe(201);
      expect(res._json).toHaveProperty("message", "Feedback submitted");
    });

    it("should accept negative rating", async () => {
      const conversationBuilder = createMockQueryBuilder({
        selectData: { id: "conv123" },
      });
      const feedbackCheckBuilder = createMockQueryBuilder({
        selectData: null,
      });
      const feedbackInsertBuilder = createMockQueryBuilder({
        insertData: { id: "feedback123" },
      });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "conversations") {
          return conversationBuilder as any;
        }
        if (table === "feedback") {
          callCount++;
          if (callCount === 1) {
            return feedbackCheckBuilder as any;
          }
          return feedbackInsertBuilder as any;
        }
        return {} as any;
      });

      const req = createMockRequest({
        body: {
          conversationId: "conv123",
          chatbotId: "chatbot123",
          rating: "negative",
        },
      });
      const res = createMockResponse();

      await submitFeedback(req, res, mockNext);

      expect(res._status).toBe(201);
    });

    it("should return NotFoundError when conversation does not exist", async () => {
      const conversationBuilder = createMockQueryBuilder({
        selectData: null,
        selectError: { message: "Not found" },
      });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "conversations") {
          return conversationBuilder as any;
        }
        return {} as any;
      });

      const req = createMockRequest({
        body: {
          conversationId: "nonexistent",
          chatbotId: "chatbot123",
          rating: "positive",
        },
      });
      const res = createMockResponse();

      await submitFeedback(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("should update existing feedback instead of creating new", async () => {
      const conversationBuilder = createMockQueryBuilder({
        selectData: { id: "conv123" },
      });
      const feedbackCheckBuilder = createMockQueryBuilder({
        selectData: { id: "existing_feedback_id" },
      });
      const updateBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      let feedbackCallCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "conversations") {
          return conversationBuilder as any;
        }
        if (table === "feedback") {
          feedbackCallCount++;
          if (feedbackCallCount === 1) {
            return feedbackCheckBuilder as any;
          }
          return updateBuilder as any;
        }
        return {} as any;
      });

      const req = createMockRequest({
        body: {
          conversationId: "conv123",
          chatbotId: "chatbot123",
          rating: "negative",
        },
      });
      const res = createMockResponse();

      await submitFeedback(req, res, mockNext);

      expect(res._json).toHaveProperty("message", "Feedback updated");
      expect(res._json).toHaveProperty("id", "existing_feedback_id");
    });
  });

  describe("getSatisfactionMetrics", () => {
    it("should return ValidationError when chatbotId is missing", async () => {
      const req = createMockRequest({
        params: {},
      });
      const res = createMockResponse();

      await getSatisfactionMetrics(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should return metrics with satisfaction rate", async () => {
      const feedbackData = [
        { rating: "positive" },
        { rating: "positive" },
        { rating: "positive" },
        { rating: "negative" },
      ];

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: feedbackData,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { chatbotId: "chatbot123" },
      });
      const res = createMockResponse();

      await getSatisfactionMetrics(req, res, mockNext);

      expect(res._json).toEqual({
        positive: 3,
        negative: 1,
        total: 4,
        satisfactionRate: 75, // 3/4 = 75%
      });
    });

    it("should return null satisfaction rate when no feedback", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { chatbotId: "chatbot123" },
      });
      const res = createMockResponse();

      await getSatisfactionMetrics(req, res, mockNext);

      expect(res._json).toEqual({
        positive: 0,
        negative: 0,
        total: 0,
        satisfactionRate: null,
      });
    });

    it("should handle 100% positive feedback", async () => {
      const feedbackData = [
        { rating: "positive" },
        { rating: "positive" },
      ];

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: feedbackData,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { chatbotId: "chatbot123" },
      });
      const res = createMockResponse();

      await getSatisfactionMetrics(req, res, mockNext);

      expect(res._json.satisfactionRate).toBe(100);
    });

    it("should handle 0% positive feedback", async () => {
      const feedbackData = [
        { rating: "negative" },
        { rating: "negative" },
      ];

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: feedbackData,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { chatbotId: "chatbot123" },
      });
      const res = createMockResponse();

      await getSatisfactionMetrics(req, res, mockNext);

      expect(res._json.satisfactionRate).toBe(0);
    });

    it("should handle database error", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { chatbotId: "chatbot123" },
      });
      const res = createMockResponse();

      await getSatisfactionMetrics(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("checkFeedback", () => {
    it("should return ValidationError when conversationId is missing", async () => {
      const req = createMockRequest({
        params: {},
      });
      const res = createMockResponse();

      await checkFeedback(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should return hasFeedback true when feedback exists", async () => {
      const builder = createMockQueryBuilder({
        selectData: { id: "feedback123", rating: "positive" },
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { conversationId: "conv123" },
      });
      const res = createMockResponse();

      await checkFeedback(req, res, mockNext);

      expect(res._json).toEqual({
        hasFeedback: true,
        rating: "positive",
      });
    });

    it("should return hasFeedback false when no feedback exists", async () => {
      const builder = createMockQueryBuilder({
        selectData: null,
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { conversationId: "conv123" },
      });
      const res = createMockResponse();

      await checkFeedback(req, res, mockNext);

      expect(res._json).toEqual({
        hasFeedback: false,
        rating: null,
      });
    });

    it("should return negative rating when feedback is negative", async () => {
      const builder = createMockQueryBuilder({
        selectData: { id: "feedback123", rating: "negative" },
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { conversationId: "conv123" },
      });
      const res = createMockResponse();

      await checkFeedback(req, res, mockNext);

      expect(res._json).toEqual({
        hasFeedback: true,
        rating: "negative",
      });
    });
  });
});
