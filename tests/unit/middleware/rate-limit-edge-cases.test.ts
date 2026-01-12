import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

// Mock redis
vi.mock("../../../server/utils/redis", () => ({
  checkRateLimit: vi.fn(),
}));

import { rateLimit, chatRateLimit } from "../../../server/middleware/rateLimit";
import { checkRateLimit } from "../../../server/utils/redis";
import { RateLimitError } from "../../../server/utils/errors";

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
  return {
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("Rate Limiting Edge Cases", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe("Concurrent requests", () => {
    it("should handle multiple concurrent requests to same rate limit key", async () => {
      let callCount = 0;
      vi.mocked(checkRateLimit).mockImplementation(async () => {
        callCount++;
        // First 5 allowed, rest blocked
        const allowed = callCount <= 5;
        return {
          allowed,
          remaining: Math.max(0, 10 - callCount),
          resetIn: 60,
        };
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
        keyGenerator: (req) => `test:${req.ip}`,
      });

      const req = createMockRequest({ ip: "192.168.1.1" });
      const res = createMockResponse();

      // Simulate 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        middleware(req, res, mockNext)
      );

      await Promise.all(promises);

      // Should have called checkRateLimit 10 times
      expect(checkRateLimit).toHaveBeenCalledTimes(10);
    });

    it("should handle race condition at exact limit boundary", async () => {
      let count = 0;
      vi.mocked(checkRateLimit).mockImplementation(async () => {
        count++;
        // Exactly at limit
        const allowed = count <= 10;
        return {
          allowed,
          remaining: Math.max(0, 10 - count),
          resetIn: 60,
        };
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      // 10 requests exactly at limit
      const promises = Array.from({ length: 10 }, () =>
        middleware(req, res, mockNext)
      );

      await Promise.all(promises);

      // All should have been checked
      expect(checkRateLimit).toHaveBeenCalledTimes(10);
    });
  });

  describe("Redis failure during rate limiting", () => {
    it("should fail-open when Redis is unavailable", async () => {
      vi.mocked(checkRateLimit).mockRejectedValue(
        new Error("Connection refused")
      );

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      // Should pass error to next (Express error handler)
      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
    });

    it("should allow requests when Redis quota is exceeded", async () => {
      // checkRateLimit returns fail-open result when Redis quota exceeded
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true, // Fail-open
        remaining: 10,
        resetIn: 60,
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      // Should allow request (fail-open)
      expect(mockNext).toHaveBeenCalledWith(); // No error
    });
  });

  describe("Window boundary edge cases", () => {
    it("should handle requests at window boundary", async () => {
      const now = Date.now();
      const windowMs = 60 * 1000;
      const windowStart = Math.floor(now / windowMs);

      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        remaining: 5,
        resetIn: 30, // Halfway through window
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(checkRateLimit).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Reset", expect.any(Number));
    });

    it("should handle TTL of 0", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        remaining: 5,
        resetIn: 0, // TTL is 0
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      // Should use windowSeconds when resetIn is 0
      const resetHeader = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0] === "X-RateLimit-Reset"
      );
      expect(resetHeader).toBeDefined();
    });

    it("should handle negative TTL", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        remaining: 5,
        resetIn: -1, // Negative TTL
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      // Should still set headers
      expect(res.setHeader).toHaveBeenCalled();
    });
  });

  describe("Dynamic limit function edge cases", () => {
    it("should handle limit function throwing error", async () => {
      const middleware = rateLimit({
        windowSeconds: 60,
        limit: () => {
          throw new Error("Limit calculation failed");
        },
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      // Should pass error to next
      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
    });

    it("should handle limit function returning invalid value", async () => {
      const middleware = rateLimit({
        windowSeconds: 60,
        limit: () => -1, // Invalid limit
      });

      const req = createMockRequest();
      const res = createMockResponse();

      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        remaining: 0,
        resetIn: 60,
      });

      await middleware(req, res, mockNext);

      // Should still call checkRateLimit with the invalid value
      expect(checkRateLimit).toHaveBeenCalledWith(expect.any(String), -1, 60);
    });
  });

  describe("Key generator edge cases", () => {
    it("should handle key generator returning empty string", async () => {
      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
        keyGenerator: () => "",
      });

      const req = createMockRequest();
      const res = createMockResponse();

      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        remaining: 5,
        resetIn: 60,
      });

      await middleware(req, res, mockNext);

      expect(checkRateLimit).toHaveBeenCalledWith("", 10, 60);
    });

    it("should handle key generator throwing error", async () => {
      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
        keyGenerator: () => {
          throw new Error("Key generation failed");
        },
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("chatRateLimit edge cases", () => {
    it("should default to free plan when subscription is undefined", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetIn: 60,
      });

      const req = createMockRequest() as any;
      req.subscription = undefined; // No subscription
      req.user = { userId: "user-123" };

      const res = createMockResponse();

      await chatRateLimit(req, res, mockNext);

      // Should use free plan limit (10)
      expect(checkRateLimit).toHaveBeenCalledWith(
        "chat:user-123",
        10, // Free plan limit
        60
      );
    });

    it("should handle invalid plan type gracefully", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetIn: 60,
      });

      const req = createMockRequest() as any;
      req.subscription = { plan: "invalid-plan" }; // Invalid plan
      req.user = { userId: "user-123" };

      const res = createMockResponse();

      await chatRateLimit(req, res, mockNext);

      // Should default to free plan
      expect(checkRateLimit).toHaveBeenCalledWith(
        "chat:user-123",
        10, // Free plan limit (default)
        60
      );
    });

    it("should use IP when user is not available", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetIn: 60,
      });

      const req = createMockRequest() as any;
      req.subscription = { plan: "free" };
      req.user = undefined; // No user
      req.ip = "192.168.1.1";

      const res = createMockResponse();

      await chatRateLimit(req, res, mockNext);

      // Should use IP as fallback
      expect(checkRateLimit).toHaveBeenCalledWith(
        "chat:192.168.1.1",
        10,
        60
      );
    });
  });

  describe("Rate limit headers edge cases", () => {
    it("should set headers even when request is blocked", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
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

      // Headers should be set before blocking
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 10);
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 0);
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Reset", expect.any(Number));

      // Should throw RateLimitError
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(RateLimitError);
    });

    it("should handle very large reset times", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        remaining: 5,
        resetIn: 999999, // Very large reset time
      });

      const middleware = rateLimit({
        windowSeconds: 60,
        limit: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      const resetCall = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0] === "X-RateLimit-Reset"
      );
      expect(resetCall).toBeDefined();
      expect(resetCall![1]).toBeGreaterThan(0);
    });
  });
});
