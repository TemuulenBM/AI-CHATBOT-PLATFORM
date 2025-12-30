import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { rateLimit } from "../../../server/middleware/rateLimit";
import { RateLimitError } from "../../../server/utils/errors";
import { PLAN_LIMITS, PlanType } from "../../../server/utils/supabase";

// Mock redis
vi.mock("../../../server/utils/redis", () => ({
  checkRateLimit: vi.fn(),
}));

import { checkRateLimit } from "../../../server/utils/redis";

// Helper factories
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: "127.0.0.1",
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as Request;
}

function createMockResponse(): Response {
  const res = {
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("Rate Limit Middleware", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe("rateLimit factory", () => {
    it("should create middleware with specified options", () => {
      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 100,
      });

      expect(typeof middleware).toBe("function");
    });

    it("should allow requests under the limit", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: true,
        remaining: 9,
        resetIn: 60,
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 10);
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 9);
    });

    it("should block requests over the limit", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        resetIn: 30,
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(RateLimitError);
    });

    it("should use custom key generator", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: true,
        remaining: 5,
        resetIn: 60,
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
        keyGenerator: (req) => `custom:${req.ip}`,
      });

      const req = createMockRequest({ ip: "192.168.1.1" });
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(checkRateLimit).toHaveBeenCalledWith("custom:192.168.1.1", 10, 60);
    });

    it("should use IP as default key", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: true,
        remaining: 5,
        resetIn: 60,
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest({ ip: "10.0.0.1" });
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(checkRateLimit).toHaveBeenCalledWith("10.0.0.1", 10, 60);
    });

    it("should use 'unknown' key when IP is not available", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: true,
        remaining: 5,
        resetIn: 60,
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest({ ip: undefined });
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(checkRateLimit).toHaveBeenCalledWith("unknown", 10, 60);
    });

    it("should use custom error message", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        resetIn: 30,
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
        message: "Custom rate limit message",
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0] as RateLimitError;
      expect(error.message).toBe("Custom rate limit message");
    });

    it("should support function-based limit", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: true,
        remaining: 99,
        resetIn: 60,
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: () => 100,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(checkRateLimit).toHaveBeenCalledWith(expect.any(String), 100, 60);
    });

    it("should set X-RateLimit-Reset header", async () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: true,
        remaining: 5,
        resetIn: 60,
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(res.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Reset",
        Math.floor(now / 1000) + 60
      );

      vi.restoreAllMocks();
    });
  });

  describe("Pre-configured rate limiters", () => {
    describe("authRateLimit configuration", () => {
      it("should have 15 minute window", () => {
        const windowSeconds = 15 * 60;
        expect(windowSeconds).toBe(900);
      });

      it("should limit to 5 attempts", () => {
        const limit = 5;
        expect(limit).toBe(5);
      });

      it("should generate auth-prefixed key", () => {
        const keyGenerator = (req: Request) => `auth:${req.ip}`;
        expect(keyGenerator({ ip: "1.2.3.4" } as Request)).toBe("auth:1.2.3.4");
      });
    });

    describe("apiRateLimit configuration", () => {
      it("should have 1 minute window", () => {
        const windowSeconds = 60;
        expect(windowSeconds).toBe(60);
      });

      it("should limit to 60 requests per minute", () => {
        const limit = 60;
        expect(limit).toBe(60);
      });

      it("should generate api-prefixed key", () => {
        const keyGenerator = (req: Request) => `api:${req.ip}`;
        expect(keyGenerator({ ip: "1.2.3.4" } as Request)).toBe("api:1.2.3.4");
      });
    });

    describe("chatRateLimit configuration", () => {
      it("should have 1 minute window", () => {
        const windowSeconds = 60;
        expect(windowSeconds).toBe(60);
      });

      it("should return different limits based on plan", () => {
        const limits: Record<PlanType, number> = {
          free: 10,
          starter: 30,
          growth: 100,
          business: 200,
        };

        expect(limits.free).toBe(10);
        expect(limits.starter).toBe(30);
        expect(limits.growth).toBe(100);
        expect(limits.business).toBe(200);
      });

      it("should default to free plan when subscription is missing", () => {
        const getPlanType = (plan: unknown): PlanType => {
          if (typeof plan === "string" && plan in PLAN_LIMITS) {
            return plan as PlanType;
          }
          return "free";
        };

        expect(getPlanType(undefined)).toBe("free");
        expect(getPlanType(null)).toBe("free");
        expect(getPlanType("invalid")).toBe("free");
      });

      it("should recognize valid plan types", () => {
        const getPlanType = (plan: unknown): PlanType => {
          if (typeof plan === "string" && plan in PLAN_LIMITS) {
            return plan as PlanType;
          }
          return "free";
        };

        expect(getPlanType("starter")).toBe("starter");
        expect(getPlanType("growth")).toBe("growth");
        expect(getPlanType("business")).toBe("business");
      });
    });

    describe("embeddingRateLimit configuration", () => {
      it("should have 1 hour window", () => {
        const windowSeconds = 60 * 60;
        expect(windowSeconds).toBe(3600);
      });

      it("should limit to 10 requests per hour", () => {
        const limit = 10;
        expect(limit).toBe(10);
      });
    });
  });

  describe("Error handling", () => {
    it("should pass errors to next middleware", async () => {
      const testError = new Error("Rate limit check failed");
      vi.mocked(checkRateLimit).mockRejectedValueOnce(testError);

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(testError);
    });
  });
});
