import { Request, Response, NextFunction } from "express";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { AuthenticationError, AuthorizationError } from "../utils/errors";
import { supabaseAdmin, PLAN_LIMITS, PlanType } from "../utils/supabase";
import { getCache, setCache } from "../utils/redis";
import logger from "../utils/logger";

// Initialize Clerk client
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export interface ClerkUser {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: ClerkUser;
  subscription?: {
    plan: PlanType;
    usage: {
      messages_count: number;
      chatbots_count: number;
    };
  };
}

/**
 * Sync Clerk user to Supabase database if they don't exist
 * Uses Redis caching to avoid repeated database lookups
 */
async function syncUserToSupabase(
  userId: string,
  email: string
): Promise<void> {
  const cacheKey = `user_synced:${userId}`;
  const isSynced = await getCache<boolean>(cacheKey);

  if (isSynced) {
    return;
  }

  try {
    // Check if user exists in Supabase
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 means no rows returned, which is expected for new users
      logger.error("Error checking user existence", { error: fetchError, userId });
    }

    if (!existingUser) {
      // Create user in Supabase
      const { error: insertError } = await supabaseAdmin.from("users").insert({
        id: userId,
        email: email,
        password_hash: null, // Clerk users don't have local passwords
      });

      if (insertError) {
        // Handle unique constraint violation (user already exists)
        if (insertError.code === "23505") {
          logger.debug("User already exists, skipping creation", { userId });
        } else {
          logger.error("Failed to create user in Supabase", {
            error: insertError,
            userId,
          });
          throw insertError;
        }
      } else {
        logger.info("Created new user from Clerk", { userId, email });

        // Create default subscription for new user
        const { error: subError } = await supabaseAdmin
          .from("subscriptions")
          .insert({
            user_id: userId,
            plan: "free",
            usage: { messages_count: 0, chatbots_count: 0 },
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            ).toISOString(),
          });

        if (subError) {
          logger.error("Failed to create subscription for new user", {
            error: subError,
            userId,
          });
        }
      }
    }

    // Cache that user is synced for 1 hour
    await setCache(cacheKey, true, 3600);
  } catch (error) {
    logger.error("Error syncing user to Supabase", { error, userId });
    // Don't throw - allow the request to continue even if sync fails
  }
}

/**
 * Main authentication middleware
 * Verifies Clerk session tokens and syncs users to Supabase
 */
export async function clerkAuthMiddleware(
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

    // Verify the Clerk session token
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new Error("CLERK_SECRET_KEY is not configured");
    }

    const payload = await verifyToken(token, {
      secretKey,
    });

    if (!payload || !payload.sub) {
      throw new AuthenticationError("Invalid token");
    }

    const userId = payload.sub;

    // Get user email from Clerk
    let email = "";
    try {
      const user = await clerkClient.users.getUser(userId);
      email = user.emailAddresses[0]?.emailAddress || "";
    } catch (error) {
      logger.error("Failed to get user from Clerk", { error, userId });
      // Try to get email from token claims if available
      email = (payload as Record<string, unknown>).email as string || "";
    }

    // Sync user to Supabase (non-blocking, uses caching)
    await syncUserToSupabase(userId, email);

    // Set user on request - maintaining same interface as old auth
    req.user = {
      userId,
      email,
    };

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      next(error);
    } else {
      logger.error("Authentication error", { error });
      next(new AuthenticationError("Authentication failed"));
    }
  }
}

/**
 * Optional authentication middleware
 * Verifies token if present, but continues without auth if not
 */
export async function optionalClerkAuthMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      const secretKey = process.env.CLERK_SECRET_KEY;
      if (secretKey) {
        try {
          const payload = await verifyToken(token, {
            secretKey,
          });

          if (payload && payload.sub) {
            const userId = payload.sub;
            let email = "";

            try {
              const user = await clerkClient.users.getUser(userId);
              email = user.emailAddresses[0]?.emailAddress || "";
            } catch {
              email = (payload as Record<string, unknown>).email as string || "";
            }

            await syncUserToSupabase(userId, email);

            req.user = {
              userId,
              email,
            };
          }
        } catch {
          // Token invalid, continue without auth
        }
      }
    }

    next();
  } catch {
    // Continue without auth for optional routes
    next();
  }
}

/**
 * Load subscription data for authenticated user
 * Uses Redis caching for performance
 */
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
    let subscription = await getCache<AuthenticatedRequest["subscription"]>(
      cacheKey
    );

    if (!subscription) {
      const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("plan, usage")
        .eq("user_id", req.user.userId)
        .single();

      if (error && error.code !== "PGRST116") {
        logger.error("Failed to load subscription", {
          error,
          userId: req.user.userId,
        });
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

/**
 * Require specific subscription plan(s) for access
 */
export function requirePlan(...allowedPlans: PlanType[]) {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ) => {
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

/**
 * Check if user has reached usage limit for an action
 */
export async function checkUsageLimit(
  userId: string,
  action: "message" | "chatbot"
): Promise<void> {
  const cacheKey = `subscription:${userId}`;
  let subscription = await getCache<{
    plan: PlanType;
    usage: { messages_count: number; chatbots_count: number };
  }>(cacheKey);

  if (!subscription) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, usage")
      .eq("user_id", userId)
      .single();

    if (!data) {
      return; // Default to free plan limits
    }

    subscription = data;
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

/**
 * Increment usage counter for an action
 */
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

// Export for backward compatibility with existing code
export { clerkAuthMiddleware as authMiddleware };
