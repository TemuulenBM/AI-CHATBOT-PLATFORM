import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import subscriptionsRoutes from "../../../server/routes/subscriptions";

// Mock all dependencies
vi.mock("../../../server/controllers/subscriptions", () => ({
  getPlans: vi.fn((req, res) => res.status(200).json({ plans: [] })),
  handleWebhook: vi.fn((req, res) => res.status(200).json({ success: true })),
  getSubscription: vi.fn((req, res) => res.status(200).json({ plan: "starter" })),
  createCheckout: vi.fn((req, res) => res.status(200).json({ url: "https://checkout.com" })),
  createPortal: vi.fn((req, res) => res.status(200).json({ url: "https://portal.com" })),
}));

vi.mock("../../../server/middleware/validation", () => ({
  validate: vi.fn(() => (req: any, res: any, next: any) => next()),
  schemas: {
    createCheckout: {},
  },
}));

vi.mock("../../../server/middleware/clerkAuth", () => ({
  clerkAuthMiddleware: vi.fn((req: any, res: any, next: any) => {
    req.user = { userId: "user-123" };
    next();
  }),
}));

vi.mock("../../../server/middleware/paddleWebhookValidator", () => ({
  validatePaddleWebhookOrigin: vi.fn((req: any, res: any, next: any) => next()),
}));

describe("Subscriptions Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/subscriptions", subscriptionsRoutes);
    vi.clearAllMocks();
  });

  describe("GET /api/subscriptions/plans", () => {
    it("should get available plans (public)", async () => {
      const response = await request(app).get("/api/subscriptions/plans");

      expect(response.status).toBe(200);
      expect(response.body.plans).toEqual([]);
    });
  });

  describe("POST /api/subscriptions/webhook", () => {
    it("should handle Paddle webhook", async () => {
      const response = await request(app)
        .post("/api/subscriptions/webhook")
        .send({ event: "subscription.created" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/subscriptions", () => {
    it("should get current subscription", async () => {
      const response = await request(app).get("/api/subscriptions");

      expect(response.status).toBe(200);
      expect(response.body.plan).toBe("starter");
    });
  });

  describe("POST /api/subscriptions/checkout", () => {
    it("should create checkout session", async () => {
      const response = await request(app)
        .post("/api/subscriptions/checkout")
        .send({ plan: "starter" });

      expect(response.status).toBe(200);
      expect(response.body.url).toBe("https://checkout.com");
    });
  });

  describe("POST /api/subscriptions/portal", () => {
    it("should create customer portal session", async () => {
      const response = await request(app).post("/api/subscriptions/portal");

      expect(response.status).toBe(200);
      expect(response.body.url).toBe("https://portal.com");
    });
  });
});

