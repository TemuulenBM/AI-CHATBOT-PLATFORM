import { Response, NextFunction, Request } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { AuthorizationError } from "../utils/errors";
import { CreateCheckoutInput } from "../middleware/validation";
import { stripeService } from "../services/stripe";
import { supabaseAdmin, PLAN_LIMITS } from "../utils/supabase";
import logger from "../utils/logger";

export async function createCheckout(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { plan, successUrl, cancelUrl } = req.body as CreateCheckoutInput;

    const checkoutUrl = await stripeService.createCheckoutSession(
      req.user.userId,
      req.user.email,
      plan,
      successUrl,
      cancelUrl
    );

    res.json({ url: checkoutUrl });
  } catch (error) {
    next(error);
  }
}

export async function createPortal(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { returnUrl } = req.body;

    if (!returnUrl) {
      res.status(400).json({ message: "Return URL is required" });
      return;
    }

    const portalUrl = await stripeService.createPortalSession(
      req.user.userId,
      returnUrl
    );

    res.json({ url: portalUrl });
  } catch (error) {
    next(error);
  }
}

export async function handleWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const signature = req.headers["stripe-signature"] as string;

    if (!signature) {
      res.status(400).json({ message: "Missing signature" });
      return;
    }

    const result = await stripeService.handleWebhook(
      req.rawBody as Buffer,
      signature
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getSubscription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { data: subscription, error } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", req.user.userId)
      .single();

    if (error || !subscription) {
      // Return default free subscription
      res.json({
        plan: "free",
        usage: { messages_count: 0, chatbots_count: 0 },
        limits: PLAN_LIMITS.free,
      });
      return;
    }

    res.json({
      ...subscription,
      limits: PLAN_LIMITS[subscription.plan as keyof typeof PLAN_LIMITS],
    });
  } catch (error) {
    next(error);
  }
}

export async function getPlans(
  _req: Request,
  res: Response
): Promise<void> {
  res.json({
    plans: [
      {
        id: "free",
        name: "Free",
        price: 0,
        features: [
          `${PLAN_LIMITS.free.chatbots} chatbot`,
          `${PLAN_LIMITS.free.messages} messages/month`,
          "Basic analytics",
          "Community support",
        ],
      },
      {
        id: "starter",
        name: "Starter",
        price: PLAN_LIMITS.starter.price,
        features: [
          `${PLAN_LIMITS.starter.chatbots} chatbots`,
          `${PLAN_LIMITS.starter.messages} messages/month`,
          "Advanced analytics",
          "Email support",
          "Custom branding",
        ],
      },
      {
        id: "pro",
        name: "Pro",
        price: PLAN_LIMITS.pro.price,
        features: [
          `${PLAN_LIMITS.pro.chatbots} chatbots`,
          `${PLAN_LIMITS.pro.messages} messages/month`,
          "Priority support",
          "API access",
          "White-label option",
          "Advanced customization",
        ],
      },
    ],
  });
}
