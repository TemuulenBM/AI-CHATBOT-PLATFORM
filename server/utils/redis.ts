import Redis, { RedisOptions } from "ioredis";
import logger from "./logger";

const redisUrl = (() => {
  const url = process.env.REDIS_URL;
  const isProduction = process.env.NODE_ENV === "production";
  
  if (!url) {
    if (isProduction) {
      throw new Error("FATAL: REDIS_URL environment variable is required in production");
    }
    logger.warn("REDIS_URL not set - using localhost:6379 for development");
    return "redis://localhost:6379";
  }
  
  return url;
})();

// Parse Redis URL to extract connection options (supports Upstash with TLS)
function parseRedisUrl(url: string): RedisOptions {
  const parsedUrl = new URL(url);
  
  const options: RedisOptions = {
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || "6379"),
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError(err) {
      // Only reconnect on connection-related errors
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
      return targetErrors.some(e => err.message.includes(e));
    },
  };

  // Extract password from URL (format: rediss://default:PASSWORD@host:port)
  if (parsedUrl.password) {
    options.password = parsedUrl.password;
  }

  // Enable TLS for rediss:// URLs (Upstash requires TLS)
  if (parsedUrl.protocol === "rediss:") {
    options.tls = { rejectUnauthorized: false };
  }

  return options;
}

export const redis = new Redis(parseRedisUrl(redisUrl));

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("error", (error: NodeJS.ErrnoException) => {
  // Silently ignore common connection reset errors
  if (error.code === "ECONNRESET" || error.code === "EPIPE" || error.code === "ETIMEDOUT") {
    return;
  }

  // Silently ignore Redis quota/rate limit errors (common in free tiers)
  if (error.message && (
    error.message.includes("max requests limit exceeded") ||
    error.message.includes("quota exceeded") ||
    error.message.includes("rate limit")
  )) {
    // Only log once per session to avoid spam
    if (!redis._quotaErrorLogged) {
      logger.warn("Redis quota limit reached - some features may be degraded", {
        message: error.message
      });
      (redis as any)._quotaErrorLogged = true;
    }
    return;
  }

  logger.error("Redis error", { error: error.message, code: error.code });
  if (process.env.NODE_ENV === "production") {
    logger.error("Redis connection failed in production - this may cause service degradation");
  }
});

// Cache utilities
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error("Cache get error", { key, error });
    return null;
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number = 3600
): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error("Cache set error", { key, error });
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error) {
    logger.error("Cache delete error", { key, error });
  }
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    logger.error("Cache pattern delete error", { pattern, error });
  }
}

// Rate limiting utilities
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const now = Date.now();
  const windowKey = `ratelimit:${key}:${Math.floor(now / (windowSeconds * 1000))}`;

  try {
    const count = await redis.incr(windowKey);
    if (count === 1) {
      await redis.expire(windowKey, windowSeconds);
    }

    const ttl = await redis.ttl(windowKey);

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetIn: ttl > 0 ? ttl : windowSeconds,
    };
  } catch (error) {
    logger.error("Rate limit check error", { key, error });
    return { allowed: true, remaining: limit, resetIn: windowSeconds };
  }
}

export default redis;
