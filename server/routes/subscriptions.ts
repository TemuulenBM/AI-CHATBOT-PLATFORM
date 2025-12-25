import { Router } from "express";
import * as subscriptionsController from "../controllers/subscriptions";
import { validate, schemas } from "../middleware/validation";
import { clerkAuthMiddleware as authMiddleware } from "../middleware/clerkAuth";
import { validatePaddleWebhookOrigin } from "../middleware/paddleWebhookValidator";

const router = Router();

// GET /api/subscriptions/plans - Get available plans (public)
router.get("/plans", subscriptionsController.getPlans);

// POST /api/subscriptions/webhook - Paddle webhook (must be before auth middleware)
router.post(
  "/webhook",
  validatePaddleWebhookOrigin,
  subscriptionsController.handleWebhook
);

// Protected routes
router.use(authMiddleware);

// GET /api/subscriptions - Get current subscription
router.get("/", subscriptionsController.getSubscription);

// POST /api/subscriptions/checkout - Create checkout session
router.post(
  "/checkout",
  validate({ body: schemas.createCheckout }),
  subscriptionsController.createCheckout
);

// POST /api/subscriptions/portal - Create customer portal session
router.post("/portal", subscriptionsController.createPortal);

export default router;
