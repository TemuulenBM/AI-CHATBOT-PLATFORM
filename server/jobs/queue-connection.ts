/**
 * Redis Connection Helper for BullMQ
 *
 * Provides a consistent Redis connection configuration for all BullMQ queues
 */

import logger from '../utils/logger';

// Parse Redis URL for BullMQ connection (supports Upstash with TLS)
export function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const url = new URL(redisUrl);

  const connection: {
    host: string;
    port: number;
    password?: string;
    tls?: { rejectUnauthorized: boolean };
    maxRetriesPerRequest: null;
    retryStrategy?: (times: number) => number | void;
  } = {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    maxRetriesPerRequest: null, // Required for BullMQ workers
    retryStrategy(times: number) {
      // Reduce retry attempts when quota is exceeded
      if (times > 3) {
        logger.debug("Redis retry limit reached for BullMQ - pausing retries");
        return undefined; // Stop retrying
      }
      return Math.min(times * 100, 2000);
    },
  };

  // Extract password from URL (format: rediss://default:PASSWORD@host:port)
  if (url.password) {
    connection.password = url.password;
  }

  // Enable TLS for rediss:// URLs (Upstash requires TLS)
  if (url.protocol === "rediss:") {
    connection.tls = { rejectUnauthorized: false };
  }

  return connection;
}
