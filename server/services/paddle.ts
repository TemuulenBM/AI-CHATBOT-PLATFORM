import axios from "axios";
import crypto from "crypto";
import { supabaseAdmin, PLAN_LIMITS, PlanType } from "../utils/supabase";
import { deleteCache } from "../utils/redis";
import logger from "../utils/logger";
import { ExternalServiceError, ValidationError } from "../utils/errors";
import { alertCritical, alertWarning, incrementCounter } from "../utils/monitoring";
import EmailService from "./email";

const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_ENVIRONMENT = process.env.PADDLE_ENVIRONMENT || "sandbox";

// Paddle API base URL
const PADDLE_API_BASE = PADDLE_ENVIRONMENT === "live"
  ? "https://api.paddle.com"
  : "https://sandbox-api.paddle.com";

// Price IDs from Paddle Dashboard (configured in Paddle dashboard)
const PRICE_IDS: Record<Exclude<PlanType, "free">, string> = {
  starter: process.env.PADDLE_STARTER_PRICE_ID || "",
  growth: process.env.PADDLE_GROWTH_PRICE_ID || "",
  business: process.env.PADDLE_BUSINESS_PRICE_ID || "",
};

interface PaddleCustomer {
  id: string;
  email: string;
  name?: string;
  custom_data?: Record<string, any>;
}

interface PaddleTransaction {
  id: string;
  status: string;
  customer_id: string;
  subscription_id?: string;
  checkout_url?: string;
}

interface PaddleSubscription {
  id: string;
  status: string;
  customer_id: string;
  items: Array<{
    price_id: string;
    quantity: number;
  }>;
  current_billing_period?: {
    starts_at: string;
    ends_at: string;
  };
  next_billed_at?: string;
  custom_data?: Record<string, any>;
}

interface PaddleWebhookEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: any;
}

function getPaddleAuth(): { apiKey: string } {
  if (!PADDLE_API_KEY) {
    throw new ExternalServiceError(
      "Paddle",
      "Paddle is not configured. Add PADDLE_API_KEY to enable payments."
    );
  }
  return { apiKey: PADDLE_API_KEY };
}

export class PaddleService {
  /**
   * Create or get Paddle customer
   */
  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    // Check if customer exists
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("paddle_customer_id")
      .eq("user_id", userId)
      .single();

    if (subscription?.paddle_customer_id) {
      return subscription.paddle_customer_id;
    }

    // Create new customer via Paddle API
    try {
      const { apiKey } = getPaddleAuth();

      let customerId: string;

      try {
        // Try to create new customer
        const response = await axios.post(
          `${PADDLE_API_BASE}/customers`,
          {
            email,
            custom_data: { userId },
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );
        customerId = response.data.data.id;
      } catch (createError: any) {
        // If customer already exists (409 Conflict or email already registered error),
        // try to find them by email
        if (createError.response?.status === 409 ||
            createError.response?.data?.error?.code === "customer_email_domain_not_allowed" ||
            createError.response?.data?.error?.detail?.includes("already")) {

          logger.info("Customer may already exist, searching by email", { email });

          const searchResponse = await axios.get(
            `${PADDLE_API_BASE}/customers`,
            {
              params: { email },
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            }
          );

          const existingCustomers = searchResponse.data.data;
          if (existingCustomers && existingCustomers.length > 0) {
            customerId = existingCustomers[0].id;
            logger.info("Found existing Paddle customer", { customerId, email });
          } else {
            throw createError; // Re-throw if we couldn't find the customer
          }
        } else {
          throw createError;
        }
      }

      // Try to update existing subscription first
      const { data: updateResult } = await supabaseAdmin
        .from("subscriptions")
        .update({ paddle_customer_id: customerId })
        .eq("user_id", userId)
        .select("user_id");

      // If no subscription exists, create one with the customer ID
      if (!updateResult || updateResult.length === 0) {
        await supabaseAdmin.from("subscriptions").insert({
          user_id: userId,
          paddle_customer_id: customerId,
          plan: "free",
          usage: { messages_count: 0, chatbots_count: 0 },
        });
      }

      logger.info("Paddle customer linked", { userId, customerId });
      return customerId;
    } catch (error: any) {
      logger.error("Failed to create Paddle customer", {
        error: error.response?.data || error.message,
        userId
      });
      throw new ExternalServiceError("Paddle", "Failed to create customer");
    }
  }

  /**
   * Create checkout session for subscription
   * Returns data for client-side Paddle.js checkout (no server-side transaction needed)
   */
  async createCheckoutSession(
    userId: string,
    email: string,
    plan: Exclude<PlanType, "free">,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    const customerId = await this.getOrCreateCustomer(userId, email);
    const priceId = PRICE_IDS[plan];

    if (!priceId) {
      throw new ValidationError("Invalid plan or price not configured");
    }

    // For Paddle Billing, we use client-side checkout with Paddle.js
    // This approach doesn't require creating a transaction on the server
    // and avoids the "default checkout URL not set" error

    // Return checkout data as a special format for the frontend
    // Frontend will use Paddle.Checkout.open() with items array
    const checkoutData = {
      type: "paddle_checkout",
      priceId,
      customerId,
      customData: {
        userId,
        plan,
      },
      successUrl,
    };

    logger.info("Checkout data prepared", { userId, plan, priceId, customerId });

    // Encode as base64 JSON for safe transport
    return `paddle_checkout:${Buffer.from(JSON.stringify(checkoutData)).toString("base64")}`;
  }

  /**
   * Create customer portal session for managing subscription
   */
  async createPortalSession(userId: string, returnUrl: string): Promise<string> {
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("paddle_customer_id, paddle_subscription_id, plan")
      .eq("user_id", userId)
      .single();

    if (!subscription?.paddle_customer_id) {
      logger.warn("No paddle_customer_id found for user", { userId, plan: subscription?.plan });
      throw new ValidationError("No active subscription found. Please upgrade to a paid plan first.");
    }

    try {
      const { apiKey } = getPaddleAuth();

      logger.info("Attempting to create portal session", {
        userId,
        customerId: subscription.paddle_customer_id,
        hasSubscriptionId: !!subscription.paddle_subscription_id
      });

      // Create a customer portal session for secure portal access
      // This generates a temporary authenticated link to the customer portal
      // See: https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session
      const response = await axios({
        method: 'POST',
        url: `${PADDLE_API_BASE}/customers/${subscription.paddle_customer_id}/portal-sessions`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      // Extract the portal URL from the response
      // The response contains urls.general.overview which is the authenticated customer portal link
      const portalUrl = response.data.data.urls.general.overview;

      logger.info("Portal session created successfully", { userId, customerId: subscription.paddle_customer_id });
      return portalUrl;
    } catch (error: any) {
      // Enhanced error logging to help debug Paddle API issues
      const errorDetails = {
        userId,
        customerId: subscription.paddle_customer_id,
        statusCode: error.response?.status,
        errorCode: error.response?.data?.error?.code,
        errorMessage: error.response?.data?.error?.detail || error.response?.data?.error?.message,
        fullError: error.response?.data || error.message,
      };

      logger.error("Failed to create portal session", errorDetails);

      // Provide more specific error messages based on the error type
      if (error.response?.status === 404) {
        throw new ValidationError("Customer not found in billing system. Please contact support.");
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        throw new ExternalServiceError("Paddle", "Authentication failed. Please contact support.");
      } else {
        throw new ExternalServiceError("Paddle", "Failed to create portal session. Please try again later.");
      }
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body: Buffer, signature: string): boolean {
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("Paddle webhook secret not configured");
      return false;
    }

    try {
      // Paddle uses HMAC-SHA256 for webhook signatures
      const hmac = crypto.createHmac("sha256", webhookSecret);
      hmac.update(body);
      const expectedSignature = hmac.digest("hex");

      // Paddle sends signature in format: ts=timestamp;h1=signature
      // We need to extract the h1 value
      const signatureParts = signature.split(";");
      const receivedSignature = signatureParts
        .find((part) => part.startsWith("h1="))
        ?.split("=")[1];

      if (!receivedSignature) {
        logger.warn("Invalid webhook signature format", { signature });
        return false;
      }

      // Use crypto.timingSafeEqual to prevent timing attacks
      const expectedBuffer = Buffer.from(expectedSignature, "hex");
      const receivedBuffer = Buffer.from(receivedSignature, "hex");

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch (error) {
      logger.error("Webhook signature verification failed", { error });
      return false;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(
    body: Buffer,
    signature: string
  ): Promise<{ received: boolean }> {
    if (!this.verifyWebhookSignature(body, signature)) {
      logger.error("Invalid webhook signature");
      throw new ValidationError("Invalid webhook signature");
    }

    let event: PaddleWebhookEvent;

    try {
      event = JSON.parse(body.toString());
    } catch (error) {
      logger.error("Failed to parse webhook body", { error });
      throw new ValidationError("Invalid webhook body");
    }

    // CRITICAL FIX: Check for duplicate webhook events (idempotency)
    // Paddle may retry webhooks, so we need to prevent processing the same event twice
    const { data: existingEvent } = await supabaseAdmin
      .from("webhook_events")
      .select("id")
      .eq("id", event.event_id)
      .eq("processor", "paddle")
      .single();

    if (existingEvent) {
      logger.info("Webhook event already processed (idempotent)", {
        type: event.event_type,
        eventId: event.event_id
      });
      return { received: true };
    }

    // Record the webhook event for idempotency
    await supabaseAdmin.from("webhook_events").insert({
      id: event.event_id,
      event_type: event.event_type,
      processor: "paddle",
      payload: event.data,
    });

    logger.info("Webhook received", { type: event.event_type, eventId: event.event_id });

    switch (event.event_type) {
      case "transaction.completed":
        await this.handleTransactionCompleted(event.data);
        break;

      case "subscription.created":
        await this.handleSubscriptionCreated(event.data);
        break;

      case "subscription.updated":
        await this.handleSubscriptionUpdated(event.data);
        break;

      case "subscription.canceled":
        await this.handleSubscriptionCanceled(event.data);
        break;

      case "subscription.past_due":
        await this.handleSubscriptionPastDue(event.data);
        break;

      case "transaction.payment_failed":
        await this.handlePaymentFailed(event.data);
        break;

      default:
        logger.debug("Unhandled webhook event", { type: event.event_type });
    }

    return { received: true };
  }

  private async handleTransactionCompleted(transaction: any): Promise<void> {
    const userId = transaction.custom_data?.userId;
    const plan = transaction.custom_data?.plan as PlanType;
    const subscriptionId = transaction.subscription_id;

    if (!userId || !plan) {
      logger.error("Missing metadata in transaction", { transactionId: transaction.id });
      return;
    }

    if (subscriptionId) {
      // Update subscription with subscription ID and plan
      await supabaseAdmin
        .from("subscriptions")
        .update({
          plan,
          paddle_subscription_id: subscriptionId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      // Fetch subscription details to get billing period
      try {
        const { apiKey } = getPaddleAuth();
        const subResponse = await axios.get(
          `${PADDLE_API_BASE}/subscriptions/${subscriptionId}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        const subscription = subResponse.data.data;
        if (subscription.current_billing_period) {
          await supabaseAdmin
            .from("subscriptions")
            .update({
              current_period_start: subscription.current_billing_period.starts_at,
              current_period_end: subscription.current_billing_period.ends_at,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        }
      } catch (error) {
        logger.warn("Failed to fetch subscription details", { error, subscriptionId });
      }
    }

    // CRITICAL FIX: Reset usage counters for new billing period
    // This ensures users get their full quota when payment succeeds
    await supabaseAdmin
      .from("subscriptions")
      .update({
        usage: { messages_count: 0, chatbots_count: 0 },
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    await deleteCache(`subscription:${userId}`);
    logger.info("Subscription activated and usage reset", { userId, plan, transactionId: transaction.id });

    // Send subscription confirmation email
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", userId)
      .single();

    if (user?.email && transaction.details?.totals?.total) {
      const planName = plan.charAt(0).toUpperCase() + plan.slice(1); // Capitalize first letter
      const amount = `$${(parseInt(transaction.details.totals.total) / 100).toFixed(2)}`;
      await EmailService.sendSubscriptionConfirmation(user.email, `${planName} Plan`, amount);
      logger.info("Subscription confirmation email sent", { userId, email: user.email, plan });
    }
  }

  private async handleSubscriptionCreated(subscription: PaddleSubscription): Promise<void> {
    const userId = subscription.custom_data?.userId;
    const plan = subscription.custom_data?.plan as PlanType;

    if (!userId || !plan) {
      logger.warn("Missing metadata in subscription", { subscriptionId: subscription.id });
      return;
    }

    await supabaseAdmin
      .from("subscriptions")
      .update({
        plan,
        paddle_subscription_id: subscription.id,
        current_period_start: subscription.current_billing_period?.starts_at || new Date().toISOString(),
        current_period_end: subscription.current_billing_period?.ends_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    await deleteCache(`subscription:${userId}`);
    logger.info("Subscription created", { userId, plan, subscriptionId: subscription.id });
  }

  private async handleSubscriptionUpdated(subscription: PaddleSubscription): Promise<void> {
    const { data: currentSub } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, current_period_start, usage")
      .eq("paddle_subscription_id", subscription.id)
      .single();

    if (!currentSub) {
      logger.warn("User not found for subscription update", { subscriptionId: subscription.id });
      return;
    }

    const plan = subscription.custom_data?.plan as PlanType || "free";
    const newPeriodStart = subscription.current_billing_period?.starts_at || new Date().toISOString();

    // Check if billing period has renewed (period_start changed)
    const isPeriodRenewal = currentSub.current_period_start !== newPeriodStart;

    const updateData: any = {
      plan,
      current_period_start: newPeriodStart,
      current_period_end: subscription.current_billing_period?.ends_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // CRITICAL FIX: Reset usage if billing period renewed
    if (isPeriodRenewal) {
      updateData.usage = { messages_count: 0, chatbots_count: 0 };
      logger.info("Billing period renewed, resetting usage", {
        userId: currentSub.user_id,
        subscriptionId: subscription.id
      });
    }

    await supabaseAdmin
      .from("subscriptions")
      .update(updateData)
      .eq("paddle_subscription_id", subscription.id);

    await deleteCache(`subscription:${currentSub.user_id}`);
    logger.info("Subscription updated", { subscriptionId: subscription.id, userId: currentSub.user_id, isPeriodRenewal });
  }

  private async handleSubscriptionCanceled(subscription: PaddleSubscription): Promise<void> {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, plan")
      .eq("paddle_subscription_id", subscription.id)
      .single();

    if (!data) {
      logger.warn("User not found for canceled subscription", { subscriptionId: subscription.id });
      return;
    }

    // Get user email for notification
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", data.user_id)
      .single();

    // Downgrade to free plan
    await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: "free",
        paddle_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", data.user_id);

    await deleteCache(`subscription:${data.user_id}`);

    // Send cancellation email
    if (userData?.email) {
      try {
        await EmailService.sendSubscriptionCanceled(
          userData.email,
          data.plan || "Pro",
          new Date()
        );
        logger.info("Subscription cancellation email sent", { userId: data.user_id, email: userData.email });
      } catch (emailError) {
        logger.error("Failed to send subscription cancellation email", { error: emailError, userId: data.user_id });
      }
    }

    logger.info("Subscription canceled", { userId: data.user_id });
  }

  private async handleSubscriptionPastDue(subscription: PaddleSubscription): Promise<void> {
    // Get user info for alerting
    const { data: subData } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, plan")
      .eq("paddle_subscription_id", subscription.id)
      .single();

    if (!subData) {
      logger.warn("User not found for past due subscription", { subscriptionId: subscription.id });
      return;
    }

    // Get user email
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", subData.user_id)
      .single();

    // Send past due warning email
    if (userData?.email) {
      try {
        await EmailService.sendSubscriptionPastDue(
          userData.email,
          subData.plan || "Pro",
          new Date(subscription.next_billed_at || Date.now())
        );
        logger.info("Subscription past due email sent", { userId: subData.user_id, email: userData.email });
      } catch (emailError) {
        logger.error("Failed to send past due email", { error: emailError, userId: subData.user_id });
      }
    }

    alertWarning("subscription_past_due", "Subscription payment is past due", {
      subscriptionId: subscription.id,
      userId: subData.user_id,
      status: subscription.status,
    });

    incrementCounter("billing.past_due", 1);
    logger.warn("Subscription past due", { subscriptionId: subscription.id, userId: subData.user_id });
  }

  private async handlePaymentFailed(transaction: any): Promise<void> {
    // Get user info for alerting
    const { data: subData } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, plan")
      .eq("paddle_customer_id", transaction.customer_id)
      .single();

    if (!subData) {
      logger.warn("User not found for failed payment", { customerId: transaction.customer_id });
      return;
    }

    // Get user email
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", subData.user_id)
      .single();

    // Send payment failed email
    if (userData?.email) {
      try {
        const amount = transaction.details?.totals?.total
          ? `$${(transaction.details.totals.total / 100).toFixed(2)}`
          : "N/A";

        await EmailService.sendPaymentFailed(
          userData.email,
          subData.plan || "Pro",
          amount
        );
        logger.info("Payment failed email sent", { userId: subData.user_id, email: userData.email });
      } catch (emailError) {
        logger.error("Failed to send payment failed email", { error: emailError, userId: subData.user_id });
      }
    }

    alertCritical("billing_failure", "Payment failed for subscription", {
      transactionId: transaction.id,
      customerId: transaction.customer_id,
      userId: subData.user_id,
      errorCode: transaction.error_code,
      errorDetail: transaction.error_detail,
    });

    incrementCounter("billing.payment_failed", 1);
    logger.error("Payment failed", {
      transactionId: transaction.id,
      customerId: transaction.customer_id,
      userId: subData.user_id,
    });
  }
}

export const paddleService = new PaddleService();

