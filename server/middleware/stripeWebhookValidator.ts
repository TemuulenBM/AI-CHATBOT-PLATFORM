import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

// Stripe webhook IPs (as of 2025)
// See: https://stripe.com/docs/ips
const STRIPE_WEBHOOK_IPS = [
  "3.18.12.63",
  "3.130.192.231",
  "13.235.14.237",
  "13.235.122.149",
  "18.211.135.69",
  "35.154.171.200",
  "52.15.183.38",
  "54.187.174.169",
  "54.187.205.235",
  "54.187.216.72",
];

/**
 * Validate Stripe webhook requests come from Stripe IPs
 * Only enforced in production
 */
export function validateStripeWebhookOrigin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip in development
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  const clientIp = (req.ip || req.socket.remoteAddress || "").replace("::ffff:", "");

  if (!STRIPE_WEBHOOK_IPS.includes(clientIp)) {
    logger.warn("Stripe webhook from unauthorized IP", { clientIp });
    res.status(403).json({ error: "Unauthorized webhook origin" });
    return;
  }

  next();
}
