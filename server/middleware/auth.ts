import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticationError, AuthorizationError } from "../utils/errors";
import { supabaseAdmin, PLAN_LIMITS, PlanType } from "../utils/supabase";
import { getCache, setCache } from "../utils/redis";
import logger from "../utils/logger";

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  
  if (!secret) {
    if (isProduction) {
      throw new Error("FATAL: JWT_SECRET environment variable is required in production");
    }
    console.warn("⚠️  JWT_SECRET not set - using insecure development default");
    return "development-secret-change-in-production";
  }
  
  if (secret === "development-secret-change-in-production" || 
      secret === "your-super-secret-jwt-key-change-in-production") {
    if (isProduction) {
      throw new Error("FATAL: JWT_SECRET is using a default value. Set a secure secret for production");
    }
  }
  
  return secret;
})();

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  subscription?: {
    plan: PlanType;
    usage: {
      messages_count: number;
      chatbots_count: number;
    };
  };
}

export function generateToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function generateRefreshToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    throw new AuthenticationError("Invalid or expired token");
  }
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthenticationError("No token provided");
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      req.user = verifyToken(token);
    }

    next();
  } catch {
    // Continue without auth for optional routes
    next();
  }
}

export async function loadSubscription(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      next();
      return;
    }

    const cacheKey = `subscription:${req.user.userId}`;
    let subscription = await getCache<AuthenticatedRequest["subscription"]>(cacheKey);

    if (!subscription) {
      const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("plan, usage")
        .eq("user_id", req.user.userId)
        .single();

      if (error && error.code !== "PGRST116") {
        logger.error("Failed to load subscription", { error, userId: req.user.userId });
      }

      subscription = data || {
        plan: "free" as PlanType,
        usage: { messages_count: 0, chatbots_count: 0 },
      };

      await setCache(cacheKey, subscription, 300); // Cache for 5 minutes
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePlan(...allowedPlans: PlanType[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.subscription) {
      throw new AuthorizationError("Subscription required");
    }

    if (!allowedPlans.includes(req.subscription.plan)) {
      throw new AuthorizationError(
        `This feature requires one of the following plans: ${allowedPlans.join(", ")}`
      );
    }

    next();
  };
}

export async function checkUsageLimit(
  userId: string,
  action: "message" | "chatbot"
): Promise<void> {
  const cacheKey = `subscription:${userId}`;
  const subscription = await getCache<{ plan: PlanType; usage: { messages_count: number; chatbots_count: number } }>(cacheKey);

  if (!subscription) {
    // Fetch from DB if not in cache
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, usage")
      .eq("user_id", userId)
      .single();

    if (!data) {
      // Default to free plan limits
      return;
    }
  }

  const plan = subscription?.plan || "free";
  const usage = subscription?.usage || { messages_count: 0, chatbots_count: 0 };
  const limits = PLAN_LIMITS[plan];

  if (action === "message" && usage.messages_count >= limits.messages) {
    throw new AuthorizationError(
      `Message limit reached (${limits.messages}). Please upgrade your plan.`
    );
  }

  if (action === "chatbot" && usage.chatbots_count >= limits.chatbots) {
    throw new AuthorizationError(
      `Chatbot limit reached (${limits.chatbots}). Please upgrade your plan.`
    );
  }
}

export async function incrementUsage(
  userId: string,
  action: "message" | "chatbot"
): Promise<void> {
  const field = action === "message" ? "messages_count" : "chatbots_count";

  const { error } = await supabaseAdmin.rpc("increment_usage", {
    p_user_id: userId,
    p_field: field,
  });

  if (error) {
    logger.error("Failed to increment usage", { error, userId, action });
  }

  // Invalidate cache
  await setCache(`subscription:${userId}`, null, 1);
}
