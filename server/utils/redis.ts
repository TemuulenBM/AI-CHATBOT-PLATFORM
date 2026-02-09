import Redis, { RedisOptions } from "ioredis";
import logger from "./logger";
import { alertCritical, incrementCounter } from "./monitoring";
import EmailService from "../services/email";

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

redis.on("error", async (error: NodeJS.ErrnoException) => {
  // Silently ignore common connection reset errors
  if (error.code === "ECONNRESET" || error.code === "EPIPE" || error.code === "ETIMEDOUT") {
    return;
  }

  // Handle Redis quota/rate limit errors with proper alerting
  if (error.message && (
    error.message.includes("max requests limit exceeded") ||
    error.message.includes("quota exceeded") ||
    error.message.includes("rate limit")
  )) {
    // Send critical alert with rate-limiting built-in (60s cooldown)
    alertCritical(
      "redis_connection_lost",
      "Redis quota limit exceeded - features degraded",
      {
        errorMessage: error.message,
        errorCode: error.code,
        timestamp: new Date().toISOString(),
        affectedFeatures: [
          "Rate limiting",
          "Caching",
          "Job queues",
          "Session storage"
        ],
        action: "Check Upstash Redis quota and upgrade plan if needed",
      }
    );

    // Track metric for monitoring dashboard
    incrementCounter("redis.quota_exceeded", 1);

    // Send admin email (rate limited - once per hour)
    const emailCacheKey = "redis_quota_email_sent";
    try {
      const lastSent = await redis.get(emailCacheKey).catch(() => null);

      if (!lastSent) {
        const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM;
        if (adminEmail) {
          await EmailService.sendRedisQuotaExceeded(adminEmail);
          await redis.setex(emailCacheKey, 3600, Date.now().toString()).catch(() => {});
          logger.info("Admin email sent for Redis quota exceeded", { adminEmail });
        } else {
          logger.warn("ADMIN_EMAIL not configured, skipping admin notification");
        }
      }
    } catch (emailError) {
      logger.error("Failed to send Redis quota email", { error: emailError });
    }

    // Gracefully degrade
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
    // SCAN ашиглана — redis.keys() нь бүх key-г нэг дор уншиж blocking үүсгэдэг
    // SCAN нь cursor-based iterate хийдэг тул production-д аюулгүй
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
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
    // Redis алдаа гарвал fail-closed: хандалтыг хориглоно
    // Яагаад: Rate limit нь аюулгүй байдлын механизм — fail-open бол DDoS, brute-force эрсдэл үүснэ
    logger.error("Rate limit check error - fail-closed, хандалт хориглоно", { key, error });
    return { allowed: false, remaining: 0, resetIn: windowSeconds };
  }
}

export default redis;
