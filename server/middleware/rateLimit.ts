import { Request, Response, NextFunction } from "express";
import { checkRateLimit } from "../utils/redis";
import { RateLimitError } from "../utils/errors";
import { AuthenticatedRequest } from "./auth";
import { PLAN_LIMITS, PlanType } from "../utils/supabase";

interface RateLimitOptions {
  windowSeconds: number;
  limit: number | ((req: AuthenticatedRequest) => number);
  keyGenerator?: (req: Request) => string;
  message?: string;
}

export function rateLimit(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = options.keyGenerator
        ? options.keyGenerator(req)
        : req.ip || "unknown";

      const limit =
        typeof options.limit === "function"
          ? options.limit(req as AuthenticatedRequest)
          : options.limit;

      const result = await checkRateLimit(key, limit, options.windowSeconds);

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", Math.floor(Date.now() / 1000) + result.resetIn);

      if (!result.allowed) {
        throw new RateLimitError(
          options.message || `Too many requests. Please try again in ${result.resetIn} seconds.`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Predefined rate limiters
export const authRateLimit = rateLimit({
  windowSeconds: 15 * 60, // 15 minutes
  limit: 5,
  keyGenerator: (req) => `auth:${req.ip}`,
  message: "Too many authentication attempts. Please try again later.",
});

export const apiRateLimit = rateLimit({
  windowSeconds: 60, // 1 minute
  limit: 60,
  keyGenerator: (req) => `api:${req.ip}`,
});

export const chatRateLimit = rateLimit({
  windowSeconds: 60, // 1 minute
  limit: (req: AuthenticatedRequest) => {
    const plan = req.subscription?.plan || "free";
    // Different limits per plan
    const limits: Record<PlanType, number> = {
      free: 10,
      starter: 30,
      pro: 100,
    };
    return limits[plan];
  },
  keyGenerator: (req: AuthenticatedRequest) =>
    `chat:${req.user?.userId || req.ip}`,
});

// Stricter limit for expensive operations
export const embeddingRateLimit = rateLimit({
  windowSeconds: 60 * 60, // 1 hour
  limit: 10,
  keyGenerator: (req: AuthenticatedRequest) =>
    `embedding:${req.user?.userId || req.ip}`,
  message: "Embedding rate limit reached. Please wait before creating more chatbots.",
});
