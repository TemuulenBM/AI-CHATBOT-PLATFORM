import { Request, Response, NextFunction } from "express";
import { Webhook } from "svix";
import { supabaseAdmin } from "../utils/supabase";
import logger from "../utils/logger";
import EmailService from "../services/email";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{
      email_address: string;
      id: string;
      verification?: { status: string };
    }>;
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
    created_at?: number;
    updated_at?: number;
    deleted?: boolean;
    public_metadata?: {
      is_admin?: boolean;
      [key: string]: unknown;
    };
    unsafe_metadata?: {
      is_admin?: boolean;
      [key: string]: unknown;
    };
  };
}

/**
 * Get primary email from Clerk user data
 */
function getPrimaryEmail(data: ClerkWebhookEvent["data"]): string {
  if (!data.email_addresses || data.email_addresses.length === 0) {
    return "";
  }

  // Find primary email
  if (data.primary_email_address_id) {
    const primary = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id
    );
    if (primary) {
      return primary.email_address;
    }
  }

  // Fallback to first email
  return data.email_addresses[0].email_address;
}

/**
 * Get admin status from Clerk user metadata
 * Checks both public_metadata and unsafe_metadata
 * public_metadata is preferred as it's set by the admin dashboard
 */
function getAdminStatus(data: ClerkWebhookEvent["data"]): boolean {
  // Check public_metadata first (set from Clerk dashboard)
  if (data.public_metadata?.is_admin === true) {
    return true;
  }

  // Fallback to unsafe_metadata (can be set by user but requires verification)
  if (data.unsafe_metadata?.is_admin === true) {
    return true;
  }

  return false;
}

/**
 * Handle Clerk webhook events for user lifecycle management
 *
 * Events handled:
 * - user.created: Create user in Supabase with default free subscription
 * - user.updated: Update user email in Supabase
 * - user.deleted: Delete user and their data from Supabase
 */
export async function handleClerkWebhook(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error("CLERK_WEBHOOK_SECRET is not configured");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  // Get the Svix headers for verification
  const svixId = req.headers["svix-id"] as string;
  const svixTimestamp = req.headers["svix-timestamp"] as string;
  const svixSignature = req.headers["svix-signature"] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.warn("Missing Svix headers in webhook request");
    res.status(400).json({ error: "Missing webhook headers" });
    return;
  }

  // Verify the webhook signature
  const wh = new Webhook(webhookSecret);
  let event: ClerkWebhookEvent;

  try {
    // rawBody ашиглах — JSON.stringify(req.body) нь original bytes-с ялгаатай байж болно
    // (key дараалал, whitespace гэх мэт). Signature verification яг original body шаарддаг.
    // rawBody нь express.json() middleware-ийн verify callback-аар хадгалагдсан (index.ts)
    const rawBody = req.rawBody;
    if (!rawBody) {
      logger.error("Raw body not available for webhook verification");
      res.status(400).json({ error: "Raw body not available" });
      return;
    }
    const body = typeof rawBody === "string" ? rawBody : (rawBody as Buffer).toString("utf-8");
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    logger.error("Webhook signature verification failed", { error: err });
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  const { type, data } = event;
  const userId = data.id;

  logger.info("Processing Clerk webhook", { type, userId });

  try {
    switch (type) {
      case "user.created": {
        const email = getPrimaryEmail(data);
        const isAdmin = getAdminStatus(data);

        // Create user in Supabase
        const { error: userError } = await supabaseAdmin.from("users").insert({
          id: userId,
          email: email,
          password_hash: null, // Clerk users don't have local passwords
          is_admin: isAdmin,
        });

        if (userError) {
          // Handle unique constraint violation
          if (userError.code === "23505") {
            logger.debug("User already exists, updating email and admin status", { userId });
            await supabaseAdmin
              .from("users")
              .update({ email, is_admin: isAdmin })
              .eq("id", userId);
          } else {
            throw userError;
          }
        } else {
          logger.info("Created user from webhook", { userId, email, isAdmin });
        }

        // Create default subscription
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

        if (subError && subError.code !== "23505") {
          logger.error("Failed to create subscription from webhook", {
            error: subError,
            userId,
          });
        }

        // Send welcome email
        if (email) {
          const userName = data.first_name || email.split('@')[0];
          await EmailService.sendWelcomeEmail(email, userName);
          logger.info("Welcome email sent", { userId, email });
        }

        break;
      }

      case "user.updated": {
        const email = getPrimaryEmail(data);
        const isAdmin = getAdminStatus(data);

        const { error } = await supabaseAdmin
          .from("users")
          .update({ email, is_admin: isAdmin })
          .eq("id", userId);

        if (error) {
          logger.error("Failed to update user from webhook", { error, userId });
        } else {
          logger.info("Updated user from webhook", { userId, email, isAdmin });

          // Invalidate admin status cache when user is updated
          const { invalidateAdminCache } = await import("./adminAuth");
          await invalidateAdminCache(userId);
        }

        break;
      }

      case "user.deleted": {
        // Delete user's chatbots first (cascade will handle related data)
        const { error: chatbotsError } = await supabaseAdmin
          .from("chatbots")
          .delete()
          .eq("user_id", userId);

        if (chatbotsError) {
          logger.error("Failed to delete user chatbots from webhook", {
            error: chatbotsError,
            userId,
          });
        }

        // Delete subscription
        const { error: subError } = await supabaseAdmin
          .from("subscriptions")
          .delete()
          .eq("user_id", userId);

        if (subError) {
          logger.error("Failed to delete user subscription from webhook", {
            error: subError,
            userId,
          });
        }

        // Delete user
        const { error: userError } = await supabaseAdmin
          .from("users")
          .delete()
          .eq("id", userId);

        if (userError) {
          logger.error("Failed to delete user from webhook", {
            error: userError,
            userId,
          });
        } else {
          logger.info("Deleted user from webhook", { userId });
        }

        break;
      }

      default:
        logger.debug("Unhandled webhook event type", { type });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error("Error processing Clerk webhook", { error, type, userId });
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
