import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  clerkAuthMiddleware,
  checkAndIncrementUsage,
  decrementUsage,
  loadSubscription,
  checkUsageLimit,
  incrementUsage,
  requirePlan,
  AuthenticatedRequest,
} from "../../../server/middleware/clerkAuth";
import { AuthenticationError, AuthorizationError } from "../../../server/utils/errors";

// Mock dependencies
vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      getUser: vi.fn().mockResolvedValue({
        id: "user_test123",
        emailAddresses: [{ emailAddress: "test@example.com" }],
      }),
    },
  })),
  verifyToken: vi.fn(),
}));

vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
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
import { supabaseAdmin, PLAN_LIMITS } from "../../../server/utils/supabase";
import { getCache, setCache } from "../../../server/utils/redis";

const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);
const mockSupabaseRpc = vi.mocked(supabaseAdmin.rpc);

describe("Clerk Auth Middleware", () => {
  let mockNext: NextFunction;
  let mockRes: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
  });

  describe("clerkAuthMiddleware", () => {
    it("should reject requests without authorization header", async () => {
      const req = {
        headers: {},
      } as AuthenticatedRequest;

      await clerkAuthMiddleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it("should reject requests with invalid token format", async () => {
      const req = {
        headers: {
          authorization: "InvalidFormat token123",
        },
      } as AuthenticatedRequest;

      await clerkAuthMiddleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it("should authenticate valid token and sync user", async () => {
      vi.mocked(verifyToken).mockResolvedValue({ sub: "user123" } as any);

      const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);
      const userQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "user123" },
          error: null,
        }),
      };

      mockSupabaseFrom.mockReturnValue(userQuery as any);

      const req = {
        headers: {
          authorization: "Bearer valid_token",
        },
      } as AuthenticatedRequest;

      await clerkAuthMiddleware(req, mockRes, mockNext);

      expect(req.user).toBeDefined();
      expect(req.user?.userId).toBe("user123");
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should create user in Supabase if not exists", async () => {
      vi.mocked(verifyToken).mockResolvedValue({ sub: "new_user123" } as any);
      vi.mocked(getCache).mockResolvedValue(null);

      const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);
      const userQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        }),
      };

      const insertQuery = {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === "users") {
          callCount++;
          if (callCount === 1) {
            return userQuery as any;
          }
          if (callCount === 2) {
            return insertQuery as any;
          }
        }
        if (table === "subscriptions") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          } as any;
        }
        return {} as any;
      });

      const req = {
        headers: {
          authorization: "Bearer valid_token",
        },
      } as AuthenticatedRequest;

      await clerkAuthMiddleware(req, mockRes, mockNext);

      expect(insertQuery.insert).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("checkAndIncrementUsage", () => {
    it("should check usage limit and increment atomically", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);
      const subscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            plan: "starter",
            usage: { messages_count: 5, chatbots_count: 1 },
          },
          error: null,
        }),
      };

      mockSupabaseFrom.mockReturnValue(subscriptionQuery as any);
      mockSupabaseRpc.mockResolvedValue({
        data: { allowed: true, current_usage: 6, limit: 2000, plan: "starter" },
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      await checkAndIncrementUsage("user123", "message");

      expect(mockSupabaseRpc).toHaveBeenCalledWith("check_and_increment_usage", {
        p_user_id: "user123",
        p_field: "messages_count",
        p_plan: "starter",
      });
      expect(setCache).toHaveBeenCalled();
    });

    it("should throw error when usage limit exceeded", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);
      const subscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            plan: "free",
            usage: { messages_count: 100, chatbots_count: 1 }, // At limit
          },
          error: null,
        }),
      };

      mockSupabaseFrom.mockReturnValue(subscriptionQuery as any);
      mockSupabaseRpc.mockResolvedValue({
        data: { allowed: false, current_usage: 100, limit: 100, plan: "free" },
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      await expect(checkAndIncrementUsage("user123", "message")).rejects.toThrow(
        AuthorizationError
      );
    });

    it("should use cached subscription when available", async () => {
      const cachedSubscription = {
        plan: "starter",
        usage: { messages_count: 5, chatbots_count: 1 },
      };
      vi.mocked(getCache).mockResolvedValue(cachedSubscription);
      mockSupabaseRpc.mockResolvedValue({
        data: { allowed: true, current_usage: 6, limit: 2000, plan: "starter" },
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      await checkAndIncrementUsage("user123", "message");

      expect(mockSupabaseFrom).not.toHaveBeenCalled();
      expect(mockSupabaseRpc).toHaveBeenCalled();
    });
  });

  describe("decrementUsage", () => {
    it("should decrement usage count", async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      await decrementUsage("user123", "message");

      expect(mockSupabaseRpc).toHaveBeenCalledWith("decrement_usage", {
        p_user_id: "user123",
        p_field: "messages_count",
      });
      expect(setCache).toHaveBeenCalled();
    });

    it("should handle rpc errors gracefully", async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { message: "RPC error", code: "PGRST_ERROR", details: "", hint: "", name: "PostgrestError" },
        count: null,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      // Should not throw, just log error
      await decrementUsage("user123", "message");

      expect(mockSupabaseRpc).toHaveBeenCalled();
    });
  });

  describe("loadSubscription", () => {
    it("should return cached subscription when available", async () => {
      const cachedSubscription = {
        plan: "starter",
        usage: { messages_count: 5, chatbots_count: 1 },
      };
      vi.mocked(getCache).mockResolvedValue(cachedSubscription);

      const req = {
        user: { userId: "user123", email: "test@example.com" },
      } as AuthenticatedRequest;

      await loadSubscription(req, mockRes, mockNext);

      expect(req.subscription).toEqual(cachedSubscription);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should fetch from database when cache is empty", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);
      const subscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            plan: "starter",
            usage: { messages_count: 5, chatbots_count: 1 },
            current_period_start: "2024-01-01T00:00:00Z",
            current_period_end: "2024-01-31T00:00:00Z",
          },
          error: null,
        }),
      };

      mockSupabaseFrom.mockReturnValue(subscriptionQuery as any);

      const req = {
        user: { userId: "user123", email: "test@example.com" },
      } as AuthenticatedRequest;

      await loadSubscription(req, mockRes, mockNext);

      expect(req.subscription).toBeDefined();
      expect(req.subscription?.plan).toBe("starter");
      expect(setCache).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should create default subscription if not found", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);
      const subscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        }),
      };

      mockSupabaseFrom.mockReturnValue(subscriptionQuery as any);

      const req = {
        user: { userId: "user123", email: "test@example.com" },
      } as AuthenticatedRequest;

      await loadSubscription(req, mockRes, mockNext);

      expect(req.subscription?.plan).toBe("free");
      expect(req.subscription?.usage.messages_count).toBe(0);
      expect(req.subscription?.usage.chatbots_count).toBe(0);
      expect(setCache).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("checkUsageLimit", () => {
    it("should not throw when under limit", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);
      const subscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            plan: "starter",
            usage: { messages_count: 5, chatbots_count: 1 },
          },
          error: null,
        }),
      };

      mockSupabaseFrom.mockReturnValue(subscriptionQuery as any);

      await expect(checkUsageLimit("user123", "message")).resolves.not.toThrow();
    });

    it("should throw error when at limit", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);
      const subscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            plan: "free",
            usage: { messages_count: 100, chatbots_count: 1 }, // At limit
          },
          error: null,
        }),
      };

      mockSupabaseFrom.mockReturnValue(subscriptionQuery as any);

      await expect(checkUsageLimit("user123", "message")).rejects.toThrow(AuthorizationError);
    });

    it("should use cached subscription when available", async () => {
      const cachedSubscription = {
        plan: "starter",
        usage: { messages_count: 5, chatbots_count: 1 },
      };
      vi.mocked(getCache).mockResolvedValue(cachedSubscription);

      await expect(checkUsageLimit("user123", "message")).resolves.not.toThrow();
      // Should not query database when cache is available
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });
  });

  describe("incrementUsage", () => {
    it("should increment usage count via RPC", async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      await incrementUsage("user123", "message");

      expect(mockSupabaseRpc).toHaveBeenCalledWith("increment_usage", {
        p_user_id: "user123",
        p_field: "messages_count",
      });
      expect(setCache).toHaveBeenCalled();
    });

    it("should handle RPC errors gracefully", async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { message: "RPC error", code: "PGRST_ERROR", details: "", hint: "", name: "PostgrestError" },
        count: null,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      // Should not throw, just log error
      await incrementUsage("user123", "message");

      expect(mockSupabaseRpc).toHaveBeenCalled();
    });
  });

  describe("requirePlan", () => {
    it("should allow access for allowed plan", () => {
      const middleware = requirePlan("starter", "growth");
      const req = {
        subscription: { plan: "starter" },
      } as AuthenticatedRequest;

      const result = middleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should reject access for disallowed plan", () => {
      const middleware = requirePlan("starter", "growth");
      const req = {
        subscription: { plan: "free" },
      } as AuthenticatedRequest;

      expect(() => {
        middleware(req, mockRes, mockNext);
      }).toThrow(AuthorizationError);
    });

    it("should reject when no subscription loaded", () => {
      const middleware = requirePlan("starter");
      const req = {} as AuthenticatedRequest;

      expect(() => {
        middleware(req, mockRes, mockNext);
      }).toThrow(AuthorizationError);
    });
  });
});
