import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { paddleService } from "../services/paddle";

/**
 * Validate Paddle webhook requests using signature verification
 * Paddle uses HMAC-SHA256 signature verification
 */
export function validatePaddleWebhookOrigin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip signature verification in development if webhook secret is not set
  if (process.env.NODE_ENV !== "production" && !process.env.PADDLE_WEBHOOK_SECRET) {
    logger.warn("Paddle webhook validation skipped in development (no secret configured)");
    return next();
  }

  const signature = req.headers["paddle-signature"] as string;

  if (!signature) {
    logger.warn("Paddle webhook missing signature header");
    res.status(400).json({ error: "Missing webhook signature" });
    return;
  }

  // Verify signature using Paddle service
  const body = req.rawBody as Buffer;
  if (!body) {
    logger.warn("Paddle webhook missing raw body");
    res.status(400).json({ error: "Missing request body" });
    return;
  }

  const isValid = paddleService.verifyWebhookSignature(body, signature);

  if (!isValid) {
    logger.warn("Paddle webhook signature verification failed", {
      ip: req.ip,
    });
    res.status(403).json({ error: "Invalid webhook signature" });
    return;
  }

  next();
}

