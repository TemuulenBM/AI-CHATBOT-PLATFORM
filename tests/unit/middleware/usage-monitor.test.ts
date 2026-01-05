import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { checkUsageLimits, checkAllUsersLimits } from "../../../server/middleware/usage-monitor";

// Mock dependencies
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
  PLAN_LIMITS: {
    free: { chatbots: 1, messages: 100, price: 0 },
    starter: { chatbots: 3, messages: 2000, price: 4900 },
    growth: { chatbots: 10, messages: 10000, price: 9900 },
    business: { chatbots: 999, messages: 50000, price: 29900 },
  },
}));

vi.mock("../../../server/services/email", () => ({
  default: {
    sendUsageLimitWarning: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock("../../../server/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn().mockResolvedValue(undefined),
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

import { supabaseAdmin } from "../../../server/utils/supabase";
import EmailService from "../../../server/services/email";
import { redis } from "../../../server/utils/redis";
import logger from "../../../server/utils/logger";

describe("Usage Monitor Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
    mockReq = {
      auth: { userId: "user-123" },
    } as any;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  describe("checkUsageLimits", () => {
    it("should skip if no user", async () => {
      const req = { ...mockReq, auth: undefined } as Request;
      await checkUsageLimits(req as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    });

    it("should skip if no subscription", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      await checkUsageLimits(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should not send warning if usage is below threshold", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            plan: "starter",
            usage: { messages_count: 50, chatbots_count: 1 },
          },
          error: null,
        }),
      });

      vi.mocked(redis.get).mockResolvedValue(null);

      await checkUsageLimits(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(EmailService.sendUsageLimitWarning).not.toHaveBeenCalled();
    });

    it("should send warning at 80% threshold", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              plan: "starter",
              usage: { messages_count: 1600, chatbots_count: 1 }, // 80% of 2000
            },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { email: "test@example.com" },
            error: null,
          }),
        });

      vi.mocked(redis.get).mockResolvedValue(null);

      await checkUsageLimits(mockReq as Request, mockRes as Response, mockNext);

      expect(EmailService.sendUsageLimitWarning).toHaveBeenCalledWith(
        "test@example.com",
        1600,
        2000,
        "messages"
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it("should not send duplicate warnings", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            plan: "starter",
            usage: { messages_count: 1600, chatbots_count: 1 },
          },
          error: null,
        }),
      });

      // Simulate warning was sent recently
      const recentTimestamp = Date.now().toString();
      vi.mocked(redis.get).mockResolvedValue(recentTimestamp);

      await checkUsageLimits(mockReq as Request, mockRes as Response, mockNext);

      expect(EmailService.sendUsageLimitWarning).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      });

      await checkUsageLimits(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });

    it("should check chatbot limits at 100%", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              plan: "free",
              usage: { messages_count: 50, chatbots_count: 1 }, // 100% of 1
            },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { email: "test@example.com" },
            error: null,
          }),
        });

      vi.mocked(redis.get).mockResolvedValue(null);

      await checkUsageLimits(mockReq as Request, mockRes as Response, mockNext);

      expect(EmailService.sendUsageLimitWarning).toHaveBeenCalledWith(
        "test@example.com",
        1,
        1,
        "chatbots"
      );
    });
  });

  describe("checkAllUsersLimits", () => {
    it("should check all users and send warnings", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockResolvedValue({
            data: [
              {
                user_id: "user-1",
                plan: "starter",
                usage: { messages_count: 1800, chatbots_count: 1 },
              },
              {
                user_id: "user-2",
                plan: "free",
                usage: { messages_count: 50, chatbots_count: 1 },
              },
            ],
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { email: "user1@example.com" },
            error: null,
          }),
        });

      vi.mocked(redis.get).mockResolvedValue(null);

      await checkAllUsersLimits();

      expect(EmailService.sendUsageLimitWarning).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      });

      await checkAllUsersLimits();

      expect(logger.error).toHaveBeenCalled();
    });

    it("should skip users without subscriptions", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [
            {
              user_id: null,
              plan: "starter",
              usage: { messages_count: 1800 },
            },
          ],
          error: null,
        }),
      });

      await checkAllUsersLimits();

      expect(EmailService.sendUsageLimitWarning).not.toHaveBeenCalled();
    });
  });
});

