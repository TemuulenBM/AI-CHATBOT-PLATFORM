import Stripe from "stripe";
import { supabaseAdmin, PLAN_LIMITS, PlanType } from "../utils/supabase";
import { deleteCache } from "../utils/redis";
import logger from "../utils/logger";
import { ExternalServiceError, ValidationError } from "../utils/errors";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

// Only initialize Stripe if key is provided
const stripe = STRIPE_KEY
  ? new Stripe(STRIPE_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

function getStripe(): Stripe {
  if (!stripe) {
    throw new ExternalServiceError("Stripe", "Stripe is not configured. Add STRIPE_SECRET_KEY to enable payments.");
  }
  return stripe;
}

// Price IDs from Stripe Dashboard
const PRICE_IDS: Record<Exclude<PlanType, "free">, string> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID || "price_starter",
  growth: process.env.STRIPE_GROWTH_PRICE_ID || "price_growth",
  business: process.env.STRIPE_BUSINESS_PRICE_ID || "price_business",
};

export class StripeService {
  /**
   * Create or get Stripe customer
   */
  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    // Check if customer exists
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();

    if (subscription?.stripe_customer_id) {
      return subscription.stripe_customer_id;
    }

    // Create new customer
    try {
      const customer = await getStripe().customers.create({
        email,
        metadata: { userId },
      });

      // Update subscription with customer ID
      await supabaseAdmin
        .from("subscriptions")
        .update({ stripe_customer_id: customer.id })
        .eq("user_id", userId);

      return customer.id;
    } catch (error) {
      logger.error("Failed to create Stripe customer", { error, userId });
      throw new ExternalServiceError("Stripe", "Failed to create customer");
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

    if (!priceId || priceId.startsWith("price_")) {
      throw new ValidationError("Invalid plan or price not configured");
    }

    try {
      const session = await getStripe().checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          plan,
        },
        subscription_data: {
          metadata: {
            userId,
            plan,
          },
        },
      });

      logger.info("Checkout session created", { userId, plan, sessionId: session.id });
      return session.url!;
    } catch (error) {
      logger.error("Failed to create checkout session", { error, userId, plan });
      throw new ExternalServiceError("Stripe", "Failed to create checkout session");
    }
  }

  /**
   * Create customer portal session for managing subscription
   */
  async createPortalSession(userId: string, returnUrl: string): Promise<string> {
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();

    if (!subscription?.stripe_customer_id) {
      throw new ValidationError("No subscription found");
    }

    try {
      const session = await getStripe().billingPortal.sessions.create({
        customer: subscription.stripe_customer_id,
        return_url: returnUrl,
      });

      return session.url;
    } catch (error) {
      logger.error("Failed to create portal session", { error, userId });
      throw new ExternalServiceError("Stripe", "Failed to create portal session");
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(
    body: Buffer,
    signature: string
  ): Promise<{ received: boolean }> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("Stripe webhook secret not configured");
      throw new Error("Webhook secret not configured");
    }

    let event: Stripe.Event;

    try {
      event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      logger.error("Webhook signature verification failed", { error });
      throw new ValidationError("Invalid webhook signature");
    }

    logger.info("Webhook received", { type: event.type });

    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await this.handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        logger.debug("Unhandled webhook event", { type: event.type });
    }

    return { received: true };
  }

  private async handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan as PlanType;

    if (!userId || !plan) {
      logger.error("Missing metadata in checkout session", { sessionId: session.id });
      return;
    }

    const subscription = await getStripe().subscriptions.retrieve(
      session.subscription as string
    );

    await supabaseAdmin
      .from("subscriptions")
      .update({
        plan,
        stripe_subscription_id: subscription.id,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    await deleteCache(`subscription:${userId}`);
    logger.info("Subscription activated", { userId, plan });
  }

  private async handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata?.userId;

    if (!userId) {
      // Try to find by subscription ID
      const { data } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", subscription.id)
        .single();

      if (!data) {
        logger.warn("User not found for subscription update", { subscriptionId: subscription.id });
        return;
      }
    }

    const plan = subscription.metadata?.plan as PlanType || "free";

    await supabaseAdmin
      .from("subscriptions")
      .update({
        plan,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscription.id);

    // Get user ID to invalidate cache
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscription.id)
      .single();

    if (data) {
      await deleteCache(`subscription:${data.user_id}`);
    }

    logger.info("Subscription updated", { subscriptionId: subscription.id });
  }

  private async handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscription.id)
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
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", data.user_id);

    await deleteCache(`subscription:${data.user_id}`);
    logger.info("Subscription canceled", { userId: data.user_id });
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    // Reset usage on successful payment (new billing period)
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", invoice.customer as string)
      .single();

    if (data) {
      await supabaseAdmin
        .from("subscriptions")
        .update({
          usage: { messages_count: 0, chatbots_count: 0 },
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", data.user_id);

      await deleteCache(`subscription:${data.user_id}`);
      logger.info("Usage reset for new billing period", { userId: data.user_id });
    }
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    logger.warn("Payment failed", {
      customerId: invoice.customer,
      invoiceId: invoice.id,
    });
    // Could add email notification here
  }
}

export const stripeService = new StripeService();
