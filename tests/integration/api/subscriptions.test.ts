import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express, { Express, Request, Response, NextFunction } from "express";
import request from "supertest";

// Set environment variables before any imports
process.env.CLERK_SECRET_KEY = "test-clerk-secret";
process.env.PADDLE_API_KEY = "test-paddle-key";

// Mock all external dependencies at the top level
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      getUser: vi.fn().mockResolvedValue({
        id: "user_test123",
        emailAddresses: [{ emailAddress: "test@example.com" }],
      }),
    },
  }),
  verifyToken: vi.fn().mockResolvedValue({ sub: "user_test123" }),
}));

vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          user_id: "user_test123",
          plan: "starter",
          usage: { messages_count: 50, chatbots_count: 1 },
          paddle_customer_id: "ctm_test123",
        },
        error: null,
      }),
    })),
    rpc: vi.fn().mockResolvedValue({
      data: { valid: true },
      error: null,
    }),
  },
  PLAN_LIMITS: {
    free: { chatbots: 1, messages: 100, price: 0 },
    starter: { chatbots: 3, messages: 2000, price: 4900 },
    growth: { chatbots: 10, messages: 10000, price: 9900 },
    business: { chatbots: 999, messages: 50000, price: 29900 },
  },
}));

vi.mock("../../../server/utils/redis", () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/services/paddle", () => ({
  paddleService: {
    createCheckoutSession: vi.fn().mockResolvedValue("paddle_checkout:eyJwcmljZUlkIjoicHJpX3Rlc3QifQ=="),
    createPortalSession: vi.fn().mockResolvedValue("https://customer-portal.paddle.com/portal/test"),
    getOrCreateCustomer: vi.fn().mockResolvedValue("ctm_test123"),
  },
}));

// Import mocked module to access spied functions
import { verifyToken } from "@clerk/backend";

describe("Subscription API Endpoints", () => {
  let app: Express;
  let getPlans: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let PLAN_LIMITS: Record<string, { chatbots: number; messages: number; price: number }>;

  beforeAll(async () => {
    const controllers = await import("../../../server/controllers/subscriptions");
    getPlans = controllers.getPlans as (req: Request, res: Response, next: NextFunction) => Promise<void>;

    const supabase = await import("../../../server/utils/supabase");
    PLAN_LIMITS = supabase.PLAN_LIMITS;
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Setup only the public route that doesn't require auth
    app.get("/api/subscriptions/plans", (req, res, next) => {
      getPlans(req, res, next).catch(next);
    });

    // Error handler
    app.use((err: Error & { statusCode?: number }, req: Request, res: Response, next: NextFunction) => {
      res.status(err.statusCode || 500).json({ message: err.message });
    });

    vi.clearAllMocks();
  });

  describe("GET /api/subscriptions/plans", () => {
    it("should return all available plans", async () => {
      const response = await request(app).get("/api/subscriptions/plans");

      expect(response.status).toBe(200);
      expect(response.body.plans).toHaveLength(4);
      expect(response.body.plans.map((p: { id: string }) => p.id)).toEqual(["free", "starter", "growth", "business"]);
    });

    it("should include correct plan features", async () => {
      const response = await request(app).get("/api/subscriptions/plans");

      const starterPlan = response.body.plans.find((p: { id: string }) => p.id === "starter");
      expect(starterPlan).toBeDefined();
      expect(starterPlan.price).toBe(PLAN_LIMITS.starter.price);
    });

    it("should mark growth plan as popular", async () => {
      const response = await request(app).get("/api/subscriptions/plans");

      const growthPlan = response.body.plans.find((p: { id: string }) => p.id === "growth");
      expect(growthPlan.popular).toBe(true);
    });

    it("should have zero price for free plan", async () => {
      const response = await request(app).get("/api/subscriptions/plans");

      const freePlan = response.body.plans.find((p: { id: string }) => p.id === "free");
      expect(freePlan.price).toBe(0);
    });

    it("should have increasing prices for paid plans", async () => {
      const response = await request(app).get("/api/subscriptions/plans");

      const starter = response.body.plans.find((p: { id: string }) => p.id === "starter");
      const growth = response.body.plans.find((p: { id: string }) => p.id === "growth");
      const business = response.body.plans.find((p: { id: string }) => p.id === "business");

      expect(starter.price).toBeLessThan(growth.price);
      expect(growth.price).toBeLessThan(business.price);
    });

    it("should include feature lists for each plan", async () => {
      const response = await request(app).get("/api/subscriptions/plans");

      response.body.plans.forEach((plan: { features: string[] }) => {
        expect(plan.features).toBeInstanceOf(Array);
        expect(plan.features.length).toBeGreaterThan(0);
      });
    });
  });
});
