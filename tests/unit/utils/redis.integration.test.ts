import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockMonitoring = {
  alertCritical: vi.fn(),
  incrementCounter: vi.fn(),
};

const mockInstances: any[] = [];
const eventHandlers: Record<string, (arg?: any) => void> = {};

vi.mock("../../../server/utils/logger", () => ({
  default: mockLogger,
}));

vi.mock("../../../server/utils/monitoring", () => ({
  alertCritical: mockMonitoring.alertCritical,
  incrementCounter: mockMonitoring.incrementCounter,
}));

vi.mock("ioredis", () => {
  return {
    default: class MockRedis {
      public options: any;
      public get = vi.fn();
      public setex = vi.fn();
      public del = vi.fn();
      public keys = vi.fn();
      public incr = vi.fn();
      public expire = vi.fn();
      public ttl = vi.fn();

      constructor(options: any) {
        this.options = options;
        mockInstances.push(this);
        return this;
      }

      on(event: string, handler: (arg?: any) => void) {
        eventHandlers[event] = handler;
      }
    },
  };
});

describe("server/utils/redis integration coverage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstances.length = 0;
    Object.keys(eventHandlers).forEach((key) => delete eventHandlers[key]);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it("uses localhost when REDIS_URL missing in non-production", async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = "development";
    vi.resetModules();

    await import("../../../server/utils/redis");

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "REDIS_URL not set - using localhost:6379 for development"
    );
    expect(mockInstances[0].options.host).toBe("localhost");
    expect(mockInstances[0].options.port).toBe(6379);
  });

  it("throws in production when REDIS_URL is missing", async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = "production";
    vi.resetModules();

    await expect(import("../../../server/utils/redis")).rejects.toThrow(
      "FATAL: REDIS_URL environment variable is required in production"
    );
  });

  it("parses rediss URL with password and TLS", async () => {
    process.env.REDIS_URL = "rediss://default:secret@myhost.upstash.io:6380";
    process.env.NODE_ENV = "development";
    vi.resetModules();

    await import("../../../server/utils/redis");

    const instance = mockInstances[0];
    expect(instance.options.host).toBe("myhost.upstash.io");
    expect(instance.options.port).toBe(6380);
    expect(instance.options.password).toBe("secret");
    expect(instance.options.tls).toEqual({ rejectUnauthorized: false });
  });

  it("parses redis URL with password but no TLS", async () => {
    process.env.REDIS_URL = "redis://default:secret@localhost:6379";
    process.env.NODE_ENV = "development";
    vi.resetModules();

    await import("../../../server/utils/redis");

    const instance = mockInstances[0];
    expect(instance.options.password).toBe("secret");
    expect(instance.options.tls).toBeUndefined();
  });

  it("parses redis URL without password", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.NODE_ENV = "development";
    vi.resetModules();

    await import("../../../server/utils/redis");

    const instance = mockInstances[0];
    expect(instance.options.password).toBeUndefined();
  });

  it("uses default port 6379 when port is missing from URL", async () => {
    process.env.REDIS_URL = "redis://localhost";
    process.env.NODE_ENV = "development";
    vi.resetModules();

    await import("../../../server/utils/redis");

    const instance = mockInstances[0];
    expect(instance.options.port).toBe(6379);
  });

  it("reconnectOnError handles target errors", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    const reconnectOnError = instance.options.reconnectOnError;

    expect(reconnectOnError(new Error("READONLY error"))).toBe(true);
    expect(reconnectOnError(new Error("ECONNRESET happened"))).toBe(true);
    expect(reconnectOnError(new Error("ETIMEDOUT timeout"))).toBe(true);
    expect(reconnectOnError(new Error("random error"))).toBe(false);
  });

  it("retryStrategy calculates exponential backoff with cap", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    const retryStrategy = instance.options.retryStrategy;

    expect(retryStrategy(1)).toBe(50);
    expect(retryStrategy(10)).toBe(500);
    expect(retryStrategy(40)).toBe(2000); // capped at 2000
    expect(retryStrategy(100)).toBe(2000);
  });

  it("logs connect event", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    eventHandlers["connect"]?.();

    expect(mockLogger.info).toHaveBeenCalledWith("Redis connected");
  });

  it("handles quota exceeded errors with alert and metric", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const quotaError: any = new Error("max requests limit exceeded");
    quotaError.code = "QUOTA";

    eventHandlers["error"]?.(quotaError);

    expect(mockMonitoring.alertCritical).toHaveBeenCalledWith(
      "redis_connection_lost",
      "Redis quota limit exceeded - features degraded",
      expect.objectContaining({ errorMessage: quotaError.message })
    );
    expect(mockMonitoring.incrementCounter).toHaveBeenCalledWith("redis.quota_exceeded", 1);
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      "Redis error",
      expect.objectContaining({ error: quotaError.message })
    );
  });

  it("handles 'quota exceeded' error message variation", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const quotaError: any = new Error("quota exceeded for this operation");
    quotaError.code = "QUOTA";

    eventHandlers["error"]?.(quotaError);

    expect(mockMonitoring.alertCritical).toHaveBeenCalled();
    expect(mockMonitoring.incrementCounter).toHaveBeenCalledWith("redis.quota_exceeded", 1);
  });

  it("handles 'rate limit' error message variation", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const rateLimitError: any = new Error("rate limit exceeded");
    rateLimitError.code = "RATE_LIMIT";

    eventHandlers["error"]?.(rateLimitError);

    expect(mockMonitoring.alertCritical).toHaveBeenCalled();
    expect(mockMonitoring.incrementCounter).toHaveBeenCalledWith("redis.quota_exceeded", 1);
  });

  it("silently ignores connection reset style errors", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const resetError: any = new Error("reset");
    resetError.code = "ECONNRESET";

    eventHandlers["error"]?.(resetError);

    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("silently ignores EPIPE errors", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const pipeError: any = new Error("broken pipe");
    pipeError.code = "EPIPE";

    eventHandlers["error"]?.(pipeError);

    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("silently ignores ETIMEDOUT errors", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const timeoutError: any = new Error("timeout");
    timeoutError.code = "ETIMEDOUT";

    eventHandlers["error"]?.(timeoutError);

    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("logs generic errors and warns in production", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.NODE_ENV = "production";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const genericError: any = new Error("Unexpected failure");
    genericError.code = "UNKNOWN";

    eventHandlers["error"]?.(genericError);

    expect(mockLogger.error).toHaveBeenCalledWith("Redis error", {
      error: genericError.message,
      code: genericError.code,
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Redis connection failed in production - this may cause service degradation"
    );
  });

  it("logs generic errors without production warning in non-production", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.NODE_ENV = "development";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const genericError: any = new Error("Unexpected failure");
    genericError.code = "UNKNOWN";

    eventHandlers["error"]?.(genericError);

    expect(mockLogger.error).toHaveBeenCalledWith("Redis error", {
      error: genericError.message,
      code: genericError.code,
    });
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      "Redis connection failed in production - this may cause service degradation"
    );
  });

  it("handles deleteCachePattern errors gracefully", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    instance.keys.mockRejectedValue(new Error("keys failed"));

    const { deleteCachePattern } = await import("../../../server/utils/redis");

    await deleteCachePattern("pattern:*");

    expect(mockLogger.error).toHaveBeenCalledWith("Cache pattern delete error", {
      pattern: "pattern:*",
      error: expect.any(Error),
    });
  });

  it("handles deleteCachePattern with empty keys array", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    instance.keys.mockResolvedValue([]); // empty array

    const { deleteCachePattern } = await import("../../../server/utils/redis");

    await deleteCachePattern("pattern:*");

    expect(instance.keys).toHaveBeenCalledWith("pattern:*");
    expect(instance.del).not.toHaveBeenCalled(); // Should not call del when keys.length === 0
  });

  it("deletes multiple keys when pattern matches", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    instance.keys.mockResolvedValue(["key1", "key2", "key3"]);

    const { deleteCachePattern } = await import("../../../server/utils/redis");

    await deleteCachePattern("pattern:*");

    expect(instance.del).toHaveBeenCalledWith("key1", "key2", "key3");
  });

  it("sets and retrieves cache values", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    instance.get.mockResolvedValue(JSON.stringify({ foo: "bar" }));

    const { getCache, setCache } = await import("../../../server/utils/redis");

    await setCache("key", { foo: "bar" }, 120);
    expect(instance.setex).toHaveBeenCalledWith("key", 120, JSON.stringify({ foo: "bar" }));

    const result = await getCache<{ foo: string }>("key");
    expect(result).toEqual({ foo: "bar" });
  });

  it("returns null when cache key does not exist", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    instance.get.mockResolvedValue(null); // key doesn't exist

    const { getCache } = await import("../../../server/utils/redis");

    const result = await getCache("non-existent-key");

    expect(result).toBeNull();
    expect(instance.get).toHaveBeenCalledWith("non-existent-key");
  });

  it("handles getCache JSON parse errors", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    instance.get.mockResolvedValue("invalid json{");

    const { getCache } = await import("../../../server/utils/redis");

    const result = await getCache("key");

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith("Cache get error", {
      key: "key",
      error: expect.any(Error),
    });
  });

  it("handles setCache errors gracefully", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    const setError = new Error("setex failed");
    instance.setex.mockRejectedValueOnce(setError);

    const { setCache } = await import("../../../server/utils/redis");

    await setCache("key", { data: "value" }, 60);

    expect(mockLogger.error).toHaveBeenCalledWith("Cache set error", {
      key: "key",
      error: setError,
    });
  });

  it("handles deleteCache errors gracefully", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    const delError = new Error("del failed");
    instance.del.mockRejectedValueOnce(delError);

    const { deleteCache } = await import("../../../server/utils/redis");

    await deleteCache("key");

    expect(mockLogger.error).toHaveBeenCalledWith("Cache delete error", {
      key: "key",
      error: delError,
    });
  });

  it("implements rate limiting and ttl fallback", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    instance.incr.mockResolvedValueOnce(5);
    instance.expire.mockResolvedValue(1);
    instance.ttl.mockResolvedValueOnce(-1); // force fallback to windowSeconds

    const { checkRateLimit } = await import("../../../server/utils/redis");

    const result = await checkRateLimit("user:123", 10, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
    expect(result.resetIn).toBe(60);
  });

  it("sets expire on first rate limit call", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    instance.incr.mockResolvedValueOnce(1);
    instance.expire.mockResolvedValue(1);
    instance.ttl.mockResolvedValueOnce(45);

    const { checkRateLimit } = await import("../../../server/utils/redis");

    const result = await checkRateLimit("user:abc", 5, 90);

    expect(instance.expire).toHaveBeenCalledWith(expect.any(String), 90);
    expect(result.resetIn).toBe(45);
  });

  it("fails open on rate limit errors", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();

    await import("../../../server/utils/redis");
    const instance = mockInstances[0];
    const quotaError = new Error("quota exceeded");
    instance.incr.mockRejectedValueOnce(quotaError);

    const { checkRateLimit } = await import("../../../server/utils/redis");

    const result = await checkRateLimit("user:quota", 3, 30);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
    expect(mockLogger.error).toHaveBeenCalledWith("Rate limit check error", {
      key: "user:quota",
      error: quotaError,
    });
  });
});
