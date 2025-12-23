import { Router } from "express";
import * as subscriptionsController from "../controllers/subscriptions";
import { validate, schemas } from "../middleware/validation";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// GET /api/subscriptions/plans - Get available plans (public)
router.get("/plans", subscriptionsController.getPlans);

// POST /api/subscriptions/webhook - Stripe webhook (must be before auth middleware)
router.post("/webhook", subscriptionsController.handleWebhook);

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
