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

  // Parse signature format: ts=1234567890;h1=abc123...
  const parts = signature.split(";");
  const tsValue = parts.find((p) => p.startsWith("ts="))?.split("=")[1];

  if (!tsValue) {
    logger.warn("Paddle webhook missing timestamp in signature");
    res.status(401).json({ error: "Missing timestamp in signature" });
    return;
  }

  // Validate timestamp (5 minute tolerance for replay attack prevention)
  const timestamp = parseInt(tsValue, 10);
  const now = Math.floor(Date.now() / 1000);
  const TOLERANCE_SECONDS = 5 * 60; // 5 minutes

  if (isNaN(timestamp)) {
    logger.warn("Paddle webhook invalid timestamp format", { timestamp: tsValue });
    res.status(401).json({ error: "Invalid timestamp format" });
    return;
  }

  if (now - timestamp > TOLERANCE_SECONDS) {
    logger.warn("Paddle webhook timestamp too old - potential replay attack", {
      timestamp,
      now,
      age: now - timestamp,
      ip: req.ip,
    });
    res.status(401).json({ error: "Webhook timestamp too old" });
    return;
  }

  if (timestamp > now + TOLERANCE_SECONDS) {
    logger.warn("Paddle webhook timestamp in future - possible clock skew", {
      timestamp,
      now,
      diff: timestamp - now,
      ip: req.ip,
    });
    res.status(401).json({ error: "Webhook timestamp too new" });
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

