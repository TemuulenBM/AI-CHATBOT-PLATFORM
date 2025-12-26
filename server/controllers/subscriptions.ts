import { Response, NextFunction, Request } from "express";
import { AuthenticatedRequest } from "../middleware/clerkAuth";
import { AuthorizationError } from "../utils/errors";
import { CreateCheckoutInput } from "../middleware/validation";
import { paddleService } from "../services/paddle";
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

    // CRITICAL FIX: Validate plan downgrade to prevent users from downgrading
    // to a plan that doesn't support their current usage
    const { data: validationResult, error: validationError } = await supabaseAdmin
      .rpc("validate_plan_change", {
        p_user_id: req.user.userId,
        p_new_plan: plan,
      });

    if (validationError) {
      logger.error("Failed to validate plan change", { error: validationError, userId: req.user.userId });
      throw new Error("Failed to validate plan change");
    }

    const validation = validationResult as { valid: boolean; reason?: string; message?: string };

    if (!validation.valid) {
      logger.warn("Plan downgrade blocked due to usage constraints", {
        userId: req.user.userId,
        targetPlan: plan,
        reason: validation.reason
      });
      res.status(400).json({
        error: validation.message || "Cannot downgrade to this plan due to current usage",
        reason: validation.reason
      });
      return;
    }

    const checkoutUrl = await paddleService.createCheckoutSession(
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

    const portalUrl = await paddleService.createPortalSession(
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
    const signature = req.headers["paddle-signature"] as string;

    if (!signature) {
      res.status(400).json({ message: "Missing signature" });
      return;
    }

    const result = await paddleService.handleWebhook(
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
        popular: false,
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
        popular: false,
        features: [
          `${PLAN_LIMITS.starter.chatbots} chatbots`,
          `${PLAN_LIMITS.starter.messages.toLocaleString()} messages/month`,
          "Advanced analytics",
          "Email support",
          "Custom branding",
        ],
      },
      {
        id: "growth",
        name: "Growth",
        price: PLAN_LIMITS.growth.price,
        popular: true,
        features: [
          `${PLAN_LIMITS.growth.chatbots} chatbots`,
          `${PLAN_LIMITS.growth.messages.toLocaleString()} messages/month`,
          "Priority support",
          "Remove branding",
          "API access",
          "GPT-5 support",
        ],
      },
      {
        id: "business",
        name: "Business",
        price: PLAN_LIMITS.business.price,
        popular: false,
        features: [
          "Unlimited chatbots",
          `${PLAN_LIMITS.business.messages.toLocaleString()} messages/month`,
          "Dedicated support",
          "White-label option",
          "Custom integrations",
          "Advanced customization",
          "SLA guarantee",
        ],
      },
    ],
  });
}
