import axios from "axios";
import crypto from "crypto";
import { supabaseAdmin, PLAN_LIMITS, PlanType } from "../utils/supabase";
import { deleteCache } from "../utils/redis";
import logger from "../utils/logger";
import { ExternalServiceError, ValidationError } from "../utils/errors";

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

      const customerId = response.data.data.id;

      // Update subscription with customer ID
      await supabaseAdmin
        .from("subscriptions")
        .update({ paddle_customer_id: customerId })
        .eq("user_id", userId);

      logger.info("Paddle customer created", { userId, customerId });
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

    try {
      const { apiKey } = getPaddleAuth();

      // Create transaction with subscription
      // Note: Paddle requires either a default checkout URL in dashboard OR we provide checkout details
      const response = await axios.post(
        `${PADDLE_API_BASE}/transactions`,
        {
          items: [
            {
              price_id: priceId,
              quantity: 1,
            },
          ],
          customer_id: customerId,
          custom_data: {
            userId,
            plan,
          },
          checkout: {
            url: successUrl,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const transaction = response.data.data;

      // Paddle returns checkout URL in the response
      // If not provided, construct it from the transaction ID
      let checkoutUrl: string;
      if (transaction.checkout?.url) {
        checkoutUrl = transaction.checkout.url;
      } else if (transaction.id) {
        // Construct checkout URL using Paddle's checkout format
        const baseUrl = PADDLE_ENVIRONMENT === "live"
          ? "https://buy.paddle.com"
          : "https://sandbox-buy.paddle.com";
        checkoutUrl = `${baseUrl}/checkout/${transaction.id}`;
      } else {
        throw new Error("No checkout URL or transaction ID returned from Paddle");
      }

      logger.info("Checkout session created", { userId, plan, transactionId: transaction.id });
      return checkoutUrl;
    } catch (error: any) {
      logger.error("Failed to create checkout session", {
        error: error.response?.data || error.message,
        userId,
        plan
      });
      throw new ExternalServiceError("Paddle", "Failed to create checkout session");
    }
  }

  /**
   * Create customer portal session for managing subscription
   */
  async createPortalSession(userId: string, returnUrl: string): Promise<string> {
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("paddle_customer_id")
      .eq("user_id", userId)
      .single();

    if (!subscription?.paddle_customer_id) {
      throw new ValidationError("No subscription found");
    }

    try {
      const { apiKey } = getPaddleAuth();

      // Paddle uses a different approach for customer portal
      // We'll use the customer update endpoint or redirect to Paddle's customer portal
      // Note: Paddle's customer portal URL structure
      const portalUrl = `https://${PADDLE_ENVIRONMENT === "live" ? "vendors" : "sandbox-vendors"}.paddle.com/customers/${subscription.paddle_customer_id}`;

      logger.info("Portal session created", { userId, customerId: subscription.paddle_customer_id });
      return portalUrl;
    } catch (error: any) {
      logger.error("Failed to create portal session", {
        error: error.response?.data || error.message,
        userId
      });
      throw new ExternalServiceError("Paddle", "Failed to create portal session");
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

    await deleteCache(`subscription:${userId}`);
    logger.info("Subscription activated", { userId, plan, transactionId: transaction.id });
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
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("paddle_subscription_id", subscription.id)
      .single();

    if (!data) {
      logger.warn("User not found for subscription update", { subscriptionId: subscription.id });
      return;
    }

    const plan = subscription.custom_data?.plan as PlanType || "free";

    await supabaseAdmin
      .from("subscriptions")
      .update({
        plan,
        current_period_start: subscription.current_billing_period?.starts_at || new Date().toISOString(),
        current_period_end: subscription.current_billing_period?.ends_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("paddle_subscription_id", subscription.id);

    await deleteCache(`subscription:${data.user_id}`);
    logger.info("Subscription updated", { subscriptionId: subscription.id, userId: data.user_id });
  }

  private async handleSubscriptionCanceled(subscription: PaddleSubscription): Promise<void> {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("paddle_subscription_id", subscription.id)
      .single();

    if (!data) {
      logger.warn("User not found for canceled subscription", { subscriptionId: subscription.id });
      return;
    }

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
    logger.info("Subscription canceled", { userId: data.user_id });
  }

  private async handleSubscriptionPastDue(subscription: PaddleSubscription): Promise<void> {
    logger.warn("Subscription past due", { subscriptionId: subscription.id });
    // Could add email notification here
  }

  private async handlePaymentFailed(transaction: any): Promise<void> {
    logger.warn("Payment failed", {
      transactionId: transaction.id,
      customerId: transaction.customer_id,
    });
    // Could add email notification here
  }
}

export const paddleService = new PaddleService();

