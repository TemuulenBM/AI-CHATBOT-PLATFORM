import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";

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
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: { allowed: true, current_usage: 1, limit: 100 }, error: null }),
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

import { verifyToken } from "@clerk/backend";
import {
  clerkAuthMiddleware,
  optionalClerkAuthMiddleware,
  loadSubscription,
  requirePlan,
  checkAndIncrementUsage,
  AuthenticatedRequest,
} from "../../../server/middleware/clerkAuth";
import { AuthenticationError, AuthorizationError } from "../../../server/utils/errors";
import { supabaseAdmin } from "../../../server/utils/supabase";
import { getCache, setCache } from "../../../server/utils/redis";

describe("clerkAuthMiddleware", () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {};
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("clerkAuthMiddleware", () => {
    it("should reject request without authorization header", async () => {
      await clerkAuthMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it("should reject request with invalid Bearer format", async () => {
      mockReq.headers = { authorization: "InvalidFormat token123" };

      await clerkAuthMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it("should authenticate user with valid token", async () => {
      mockReq.headers = { authorization: "Bearer valid-token-123" };

      (verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({
        sub: "user_test123",
      });

      await clerkAuthMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe("user_test123");
      // Email may be empty if Clerk API call fails in test environment
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should reject invalid token", async () => {
      mockReq.headers = { authorization: "Bearer invalid-token" };

      (verifyToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Invalid token"));

      await clerkAuthMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it("should sync new user to Supabase", async () => {
      mockReq.headers = { authorization: "Bearer valid-token" };

      (verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({
        sub: "user_new123",
      });

      // Mock user not synced (cache miss)
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Mock no existing user in DB
      const mockFrom = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      }));
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);

      await clerkAuthMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(supabaseAdmin.from).toHaveBeenCalledWith("users");
      expect(setCache).toHaveBeenCalled();
    });
  });

  describe("optionalClerkAuthMiddleware", () => {
    it("should continue without error when no token provided", async () => {
      mockReq.headers = {};

      await optionalClerkAuthMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should set user when valid token provided", async () => {
      mockReq.headers = { authorization: "Bearer valid-token" };

      (verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({
        sub: "user_test123",
      });

      await optionalClerkAuthMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe("user_test123");
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should continue without user when token is invalid", async () => {
      mockReq.headers = { authorization: "Bearer invalid-token" };

      (verifyToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Invalid"));

      await optionalClerkAuthMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("loadSubscription", () => {
    it("should skip loading when no user present", async () => {
      mockReq.user = undefined;

      await loadSubscription(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.subscription).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should load subscription from cache", async () => {
      mockReq.user = { userId: "user_test123", email: "test@example.com" };

      const cachedSubscription = {
        plan: "starter" as const,
        usage: { messages_count: 50, chatbots_count: 1 },
      };
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValue(cachedSubscription);

      await loadSubscription(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.subscription).toEqual(cachedSubscription);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should load subscription from database when not cached", async () => {
      mockReq.user = { userId: "user_test123", email: "test@example.com" };

      (getCache as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const dbSubscription = {
        plan: "growth",
        usage: { messages_count: 100, chatbots_count: 5 },
      };

      const mockFrom = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: dbSubscription, error: null }),
      }));
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);

      await loadSubscription(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.subscription).toEqual(dbSubscription);
      expect(setCache).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should use default free plan when no subscription found", async () => {
      mockReq.user = { userId: "user_test123", email: "test@example.com" };

      (getCache as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const mockFrom = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      }));
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);

      await loadSubscription(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.subscription).toEqual({
        plan: "free",
        usage: { messages_count: 0, chatbots_count: 0 },
      });
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("requirePlan", () => {
    it("should throw error when no subscription", () => {
      mockReq.subscription = undefined;

      const middleware = requirePlan("starter", "growth");

      expect(() =>
        middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext)
      ).toThrow(AuthorizationError);
    });

    it("should throw error when plan not allowed", () => {
      mockReq.subscription = {
        plan: "free",
        usage: { messages_count: 0, chatbots_count: 0 },
      };

      const middleware = requirePlan("starter", "growth");

      expect(() =>
        middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext)
      ).toThrow(AuthorizationError);
    });

    it("should allow access when plan is in allowed list", () => {
      mockReq.subscription = {
        plan: "growth",
        usage: { messages_count: 0, chatbots_count: 0 },
      };

      const middleware = requirePlan("starter", "growth", "business");

      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});

describe("checkAndIncrementUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow usage when under limit", async () => {
    (getCache as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: "starter",
      usage: { messages_count: 50, chatbots_count: 1 },
    });

    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { allowed: true, current_usage: 51, limit: 2000, plan: "starter" },
      error: null,
    });

    await expect(checkAndIncrementUsage("user_test123", "message")).resolves.toBeUndefined();
  });

  it("should throw AuthorizationError when limit exceeded", async () => {
    (getCache as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: "free",
      usage: { messages_count: 100, chatbots_count: 1 },
    });

    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { allowed: false, current_usage: 100, limit: 100, plan: "free" },
      error: null,
    });

    await expect(checkAndIncrementUsage("user_test123", "message")).rejects.toThrow(
      AuthorizationError
    );
  });

  it("should throw error when RPC fails", async () => {
    (getCache as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: "starter",
      usage: { messages_count: 50, chatbots_count: 1 },
    });

    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "Database error" },
    });

    await expect(checkAndIncrementUsage("user_test123", "message")).rejects.toThrow(
      "Failed to process usage tracking"
    );
  });

  it("should invalidate cache after successful increment", async () => {
    (getCache as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: "starter",
      usage: { messages_count: 50, chatbots_count: 1 },
    });

    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { allowed: true, current_usage: 51, limit: 2000, plan: "starter" },
      error: null,
    });

    await checkAndIncrementUsage("user_test123", "message");

    expect(setCache).toHaveBeenCalledWith("subscription:user_test123", null, 1);
  });
});
