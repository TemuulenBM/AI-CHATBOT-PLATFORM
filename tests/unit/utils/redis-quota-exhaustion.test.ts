import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock email service to prevent Resend initialization errors
vi.mock("../../../server/services/email", () => ({
  default: {
    sendRedisQuotaExceeded: vi.fn().mockResolvedValue({ success: true }),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock Redis as a class constructor - define inside mock to avoid hoisting issues
vi.mock("ioredis", () => {
  const mockRedis = {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    on: vi.fn(),
  };
  
  return {
    default: class MockRedis {
      constructor() {
        return mockRedis;
      }
    },
  };
});

// Import after mocks
import { getCache, setCache, deleteCache, checkRateLimit } from "../../../server/utils/redis";
import logger from "../../../server/utils/logger";
import Redis from "ioredis";

// Get the mocked Redis instance
const mockRedis = new Redis() as any;

describe("Redis Quota Exhaustion Scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCache quota exhaustion", () => {
    it("should return null when Redis quota is exceeded", async () => {
      const quotaError = new Error("max requests limit exceeded");
      vi.mocked(mockRedis.get).mockRejectedValue(quotaError);

      const result = await getCache("test-key");

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith("Cache get error", {
        key: "test-key",
        error: quotaError,
      });
    });

    it("should return null when Redis quota exceeded with different error message", async () => {
      const quotaError = new Error("quota exceeded for this operation");
      vi.mocked(mockRedis.get).mockRejectedValue(quotaError);

      const result = await getCache("test-key");

      expect(result).toBeNull();
    });

    it("should return null when Redis rate limit error occurs", async () => {
      const rateLimitError = new Error("rate limit exceeded");
      vi.mocked(mockRedis.get).mockRejectedValue(rateLimitError);

      const result = await getCache("test-key");

      expect(result).toBeNull();
    });

    it("should handle connection errors gracefully", async () => {
      const connError = new Error("Connection refused");
      (connError as any).code = "ECONNREFUSED";
      vi.mocked(mockRedis.get).mockRejectedValue(connError);

      const result = await getCache("test-key");

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("setCache quota exhaustion", () => {
    it("should handle quota exceeded error silently", async () => {
      const quotaError = new Error("max requests limit exceeded");
      vi.mocked(mockRedis.setex).mockRejectedValue(quotaError);

      await setCache("test-key", { data: "value" }, 3600);

      expect(logger.error).toHaveBeenCalledWith("Cache set error", {
        key: "test-key",
        error: quotaError,
      });
    });

    it("should not throw when quota is exceeded", async () => {
      const quotaError = new Error("quota exceeded");
      vi.mocked(mockRedis.setex).mockRejectedValue(quotaError);

      await expect(setCache("test-key", { data: "value" })).resolves.not.toThrow();
    });

    it("should handle timeout errors", async () => {
      const timeoutError = new Error("Connection timeout");
      (timeoutError as any).code = "ETIMEDOUT";
      vi.mocked(mockRedis.setex).mockRejectedValue(timeoutError);

      await setCache("test-key", { data: "value" });

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("deleteCache quota exhaustion", () => {
    it("should handle quota exceeded error gracefully", async () => {
      const quotaError = new Error("max requests limit exceeded");
      vi.mocked(mockRedis.del).mockRejectedValue(quotaError);

      await deleteCache("test-key");

      expect(logger.error).toHaveBeenCalledWith("Cache delete error", {
        key: "test-key",
        error: quotaError,
      });
    });

    it("should not throw when quota is exceeded", async () => {
      const quotaError = new Error("quota exceeded");
      vi.mocked(mockRedis.del).mockRejectedValue(quotaError);

      await expect(deleteCache("test-key")).resolves.not.toThrow();
    });
  });

  describe("checkRateLimit quota exhaustion", () => {
    it("should allow requests when Redis quota is exceeded (fail-open)", async () => {
      const quotaError = new Error("max requests limit exceeded");
      vi.mocked(mockRedis.incr).mockRejectedValue(quotaError);

      const result = await checkRateLimit("user:123", 10, 60);

      // Should fail-open (allow request) when Redis is unavailable
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
      expect(result.resetIn).toBe(60);
      expect(logger.error).toHaveBeenCalledWith("Rate limit check error", {
        key: "user:123",
        error: quotaError,
      });
    });

    it("should allow requests when Redis connection fails", async () => {
      const connError = new Error("Connection refused");
      vi.mocked(mockRedis.incr).mockRejectedValue(connError);

      const result = await checkRateLimit("user:123", 10, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });

    it("should handle quota error during expire call", async () => {
      vi.mocked(mockRedis.incr).mockResolvedValue(1);
      const quotaError = new Error("quota exceeded");
      vi.mocked(mockRedis.expire).mockRejectedValue(quotaError);

      const result = await checkRateLimit("user:123", 10, 60);

      // Should still return result even if expire fails
      expect(result).toBeDefined();
    });

    it("should handle quota error during ttl call", async () => {
      vi.mocked(mockRedis.incr).mockResolvedValue(5);
      vi.mocked(mockRedis.expire).mockResolvedValue(1);
      const quotaError = new Error("quota exceeded");
      vi.mocked(mockRedis.ttl).mockRejectedValue(quotaError);

      const result = await checkRateLimit("user:123", 10, 60);

      // Should use windowSeconds as fallback when TTL fails
      expect(result.resetIn).toBe(60);
    });
  });

  describe("Redis error event handling", () => {
    it("should silently ignore quota exceeded errors", () => {
      const quotaError = new Error("max requests limit exceeded");
      (quotaError as any).code = undefined;

      // Simulate error event handler
      const errorHandler = (error: Error) => {
        if (
          error.message &&
          (error.message.includes("max requests limit exceeded") ||
            error.message.includes("quota exceeded") ||
            error.message.includes("rate limit"))
        ) {
          return; // Silently ignore
        }
        logger.error("Redis error", { error: error.message, code: (error as any).code });
      };

      errorHandler(quotaError);

      // Should not log error for quota exceeded
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("should log other Redis errors", () => {
      const otherError = new Error("Unknown Redis error");
      (otherError as any).code = "UNKNOWN";

      const errorHandler = (error: Error) => {
        if (
          error.message &&
          (error.message.includes("max requests limit exceeded") ||
            error.message.includes("quota exceeded") ||
            error.message.includes("rate limit"))
        ) {
          return;
        }
        logger.error("Redis error", { error: error.message, code: (error as any).code });
      };

      errorHandler(otherError);

      expect(logger.error).toHaveBeenCalled();
    });

    it("should silently ignore connection reset errors", () => {
      const resetError = new Error("Connection reset");
      (resetError as any).code = "ECONNRESET";

      const errorHandler = (error: NodeJS.ErrnoException) => {
        if (error.code === "ECONNRESET" || error.code === "EPIPE" || error.code === "ETIMEDOUT") {
          return; // Silently ignore
        }
        logger.error("Redis error", { error: error.message, code: error.code });
      };

      errorHandler(resetError);

      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("Graceful degradation scenarios", () => {
    it("should continue operating when Redis is unavailable", async () => {
      // Simulate Redis completely unavailable
      vi.mocked(mockRedis.get).mockRejectedValue(new Error("Connection refused"));
      vi.mocked(mockRedis.setex).mockRejectedValue(new Error("Connection refused"));
      vi.mocked(mockRedis.incr).mockRejectedValue(new Error("Connection refused"));

      // Cache operations should not throw
      await expect(getCache("key")).resolves.toBeNull();
      await expect(setCache("key", "value")).resolves.not.toThrow();

      // Rate limiting should fail-open
      const rateLimitResult = await checkRateLimit("user:123", 10, 60);
      expect(rateLimitResult.allowed).toBe(true);
    });

    it("should handle intermittent Redis failures", async () => {
      // First call succeeds, second fails
      vi.mocked(mockRedis.get)
        .mockResolvedValueOnce(JSON.stringify({ data: "value" }))
        .mockRejectedValueOnce(new Error("quota exceeded"));

      const result1 = await getCache("key1");
      expect(result1).toEqual({ data: "value" });

      const result2 = await getCache("key2");
      expect(result2).toBeNull();
    });

    it("should handle partial quota exhaustion (some operations fail)", async () => {
      // get works, set fails
      vi.mocked(mockRedis.get).mockResolvedValue(JSON.stringify({ data: "value" }));
      vi.mocked(mockRedis.setex).mockRejectedValue(new Error("quota exceeded"));

      const getResult = await getCache("key");
      expect(getResult).toEqual({ data: "value" });

      await setCache("key", "new-value");
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("Concurrent quota exhaustion", () => {
    it("should handle multiple concurrent quota errors", async () => {
      const quotaError = new Error("max requests limit exceeded");
      vi.mocked(mockRedis.get).mockRejectedValue(quotaError);

      const promises = Array.from({ length: 10 }, () => getCache("test-key"));

      const results = await Promise.all(promises);

      // All should return null gracefully
      results.forEach((result) => {
        expect(result).toBeNull();
      });

      expect(logger.error).toHaveBeenCalledTimes(10);
    });

    it("should handle mixed success and quota errors", async () => {
      vi.mocked(mockRedis.get)
        .mockResolvedValueOnce(JSON.stringify({ data: "success" }))
        .mockRejectedValueOnce(new Error("quota exceeded"))
        .mockResolvedValueOnce(JSON.stringify({ data: "success2" }));

      const results = await Promise.all([
        getCache("key1"),
        getCache("key2"),
        getCache("key3"),
      ]);

      expect(results[0]).toEqual({ data: "success" });
      expect(results[1]).toBeNull();
      expect(results[2]).toEqual({ data: "success2" });
    });
  });
});
