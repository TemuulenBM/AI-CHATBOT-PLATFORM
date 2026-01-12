import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./clerkAuth";
import { AuthenticationError, AuthorizationError } from "../utils/errors";
import { supabaseAdmin } from "../utils/supabase";
import { getCache, setCache } from "../utils/redis";
import logger from "../utils/logger";

/**
 * Extended request interface with admin flag
 */
export interface AdminAuthenticatedRequest extends AuthenticatedRequest {
  isAdmin?: boolean;
}

/**
 * Load admin status for authenticated user
 * Uses Redis caching for performance (cache for 5 minutes)
 */
export async function loadAdminStatus(
  req: AdminAuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      next();
      return;
    }

    const cacheKey = `admin_status:${req.user.userId}`;
    let isAdmin = await getCache<boolean>(cacheKey);

    if (isAdmin === null || isAdmin === undefined) {
      // Fetch from database
      const { data, error } = await supabaseAdmin
        .from("users")
        .select("is_admin")
        .eq("id", req.user.userId)
        .single();

      if (error) {
        logger.error("Failed to load admin status", {
          error,
          userId: req.user.userId,
        });
        // Default to non-admin on error
        isAdmin = false;
      } else {
        isAdmin = data?.is_admin || false;
      }

      // Cache for 5 minutes
      await setCache(cacheKey, isAdmin, 300);
    }

    req.isAdmin = isAdmin ?? undefined;
    next();
  } catch (error) {
    logger.error("Error in loadAdminStatus middleware", { error });
    next(error);
  }
}

/**
 * Middleware to require admin authorization
 * Must be used after clerkAuthMiddleware and loadAdminStatus
 *
 * @example
 * router.use(clerkAuthMiddleware);
 * router.use(loadAdminStatus);
 * router.get('/admin/users', requireAdmin, adminController.getUsers);
 */
export function requireAdmin(
  req: AdminAuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    // Check if user is authenticated
    if (!req.user) {
      throw new AuthenticationError("Authentication required");
    }

    // Check if admin status was loaded
    if (req.isAdmin === undefined) {
      logger.warn("Admin status not loaded - ensure loadAdminStatus middleware is used before requireAdmin");
      throw new AuthorizationError("Authorization check failed");
    }

    // Check if user is admin
    if (!req.isAdmin) {
      logger.warn("Non-admin user attempted to access admin route", {
        userId: req.user.userId,
        email: req.user.email,
      });
      throw new AuthorizationError("Admin access required");
    }

    // User is admin, proceed
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional admin middleware - loads admin status but doesn't require it
 * Useful for routes that want to provide different behavior for admins
 *
 * @example
 * router.use(clerkAuthMiddleware);
 * router.use(optionalAdmin);
 * router.get('/users', usersController.getList); // Shows different data for admins
 */
export async function optionalAdmin(
  req: AdminAuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Only load admin status if user is authenticated
    if (req.user) {
      await loadAdminStatus(req, _res, () => {});
    }
    next();
  } catch (error) {
    // Continue without admin status on error
    logger.error("Error in optionalAdmin middleware", { error });
    next();
  }
}

/**
 * Helper function to invalidate admin status cache
 * Call this when a user's admin status is changed
 */
export async function invalidateAdminCache(userId: string): Promise<void> {
  const cacheKey = `admin_status:${userId}`;
  await setCache(cacheKey, null, 1);
  logger.debug("Admin status cache invalidated", { userId });
}

/**
 * Helper function to grant admin privileges to a user
 * @param userId - The user ID to grant admin access
 * @returns Promise<void>
 */
export async function grantAdminAccess(userId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("users")
      .update({ is_admin: true })
      .eq("id", userId);

    if (error) {
      logger.error("Failed to grant admin access", { error, userId });
      throw new Error("Failed to grant admin access");
    }

    // Invalidate cache
    await invalidateAdminCache(userId);

    logger.info("Admin access granted", { userId });
  } catch (error) {
    logger.error("Error granting admin access", { error, userId });
    throw error;
  }
}

/**
 * Helper function to revoke admin privileges from a user
 * @param userId - The user ID to revoke admin access
 * @returns Promise<void>
 */
export async function revokeAdminAccess(userId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("users")
      .update({ is_admin: false })
      .eq("id", userId);

    if (error) {
      logger.error("Failed to revoke admin access", { error, userId });
      throw new Error("Failed to revoke admin access");
    }

    // Invalidate cache
    await invalidateAdminCache(userId);

    logger.info("Admin access revoked", { userId });
  } catch (error) {
    logger.error("Error revoking admin access", { error, userId });
    throw error;
  }
}
