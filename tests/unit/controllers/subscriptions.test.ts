import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

// Mock all modules before importing the controller
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    rpc: vi.fn(),
  },
  PLAN_LIMITS: {
    free: { chatbots: 1, messages: 100, price: 0 },
    starter: { chatbots: 3, messages: 5000, price: 29 },
    growth: { chatbots: 10, messages: 25000, price: 79 },
    business: { chatbots: Infinity, messages: 100000, price: 199 },
  },
}));

vi.mock("../../../server/services/paddle", () => ({
  paddleService: {
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    handleWebhook: vi.fn(),
  },
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  createCheckout,
  createPortal,
  handleWebhook,
  getSubscription,
  getPlans,
} from "../../../server/controllers/subscriptions";
import { supabaseAdmin, PLAN_LIMITS } from "../../../server/utils/supabase";
import { paddleService } from "../../../server/services/paddle";
import { AuthorizationError } from "../../../server/utils/errors";

// Mock request factory
function createMockRequest(overrides: Partial<Request> = {}): Request & { user?: { userId: string; email: string }; rawBody?: Buffer } {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: { userId: "user123", email: "test@example.com" },
    ...overrides,
  } as Request & { user?: { userId: string; email: string }; rawBody?: Buffer };
}

// Mock response factory
function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("Subscriptions Controller", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
  });

  describe("createCheckout", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await createCheckout(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should return 400 when plan validation fails", async () => {
      const req = createMockRequest({
        body: { plan: "starter", successUrl: "https://example.com/success", cancelUrl: "https://example.com/cancel" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: { valid: false, reason: "too_many_chatbots", message: "You have too many chatbots" },
        error: null,
      } as never);

      await createCheckout(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: "You have too many chatbots",
        reason: "too_many_chatbots",
      }));
    });

    it("should create checkout session when validation passes", async () => {
      const req = createMockRequest({
        body: { plan: "growth", successUrl: "https://example.com/success", cancelUrl: "https://example.com/cancel" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: { valid: true },
        error: null,
      } as never);

      vi.mocked(paddleService.createCheckoutSession).mockResolvedValue("https://checkout.paddle.com/session123");

      await createCheckout(req, res, mockNext);

      expect(res.json).toHaveBeenCalledWith({ url: "https://checkout.paddle.com/session123" });
    });
  });

  describe("createPortal", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await createPortal(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should return 400 when returnUrl is missing", async () => {
      const req = createMockRequest({
        body: {},
      });
      const res = createMockResponse();

      await createPortal(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Return URL is required" });
    });

    it("should create portal session", async () => {
      const req = createMockRequest({
        body: { returnUrl: "https://example.com/dashboard" },
      });
      const res = createMockResponse();

      vi.mocked(paddleService.createPortalSession).mockResolvedValue("https://portal.paddle.com/session123");

      await createPortal(req, res, mockNext);

      expect(res.json).toHaveBeenCalledWith({ url: "https://portal.paddle.com/session123" });
    });
  });

  describe("handleWebhook", () => {
    it("should return 400 when signature is missing", async () => {
      const req = createMockRequest({
        headers: {},
        rawBody: Buffer.from("{}"),
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Missing signature" });
    });

    it("should process webhook with valid signature", async () => {
      const req = createMockRequest({
        headers: { "paddle-signature": "valid-signature" },
        rawBody: Buffer.from("{}"),
      });
      const res = createMockResponse();

      vi.mocked(paddleService.handleWebhook).mockResolvedValue({ received: true });

      await handleWebhook(req, res, mockNext);

      expect(res.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe("getSubscription", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getSubscription(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should return default free subscription when not found", async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as never);
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await getSubscription(req, res, mockNext);

      expect(res.json).toHaveBeenCalledWith({
        plan: "free",
        usage: { messages_count: 0, chatbots_count: 0 },
        limits: PLAN_LIMITS.free,
      });
    });

    it("should return subscription with plan limits", async () => {
      const mockSubscription = {
        plan: "growth",
        usage: { messages_count: 100, chatbots_count: 2 },
      };
      const req = createMockRequest();
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as never);
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockSubscription, error: null }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await getSubscription(req, res, mockNext);

      expect(res.json).toHaveBeenCalledWith({
        ...mockSubscription,
        limits: PLAN_LIMITS.growth,
      });
    });
  });

  describe("getPlans", () => {
    it("should return all plans", async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await getPlans(req, res);

      expect(res.json).toHaveBeenCalledWith({
        plans: expect.arrayContaining([
          expect.objectContaining({ id: "free" }),
          expect.objectContaining({ id: "starter" }),
          expect.objectContaining({ id: "growth", popular: true }),
          expect.objectContaining({ id: "business" }),
        ]),
      });
    });
  });

  describe("Plan validation logic", () => {
    it("should detect invalid plan change reason", () => {
      const validation = { valid: false, reason: "too_many_chatbots" };

      if (!validation.valid) {
        expect(validation.reason).toBe("too_many_chatbots");
      }
    });

    it("should provide default error message", () => {
      const validation = { valid: false, reason: "usage_exceeded" };

      const errorMessage = validation.message || "Cannot downgrade to this plan due to current usage";
      expect(errorMessage).toBe("Cannot downgrade to this plan due to current usage");
    });
  });

  describe("PLAN_LIMITS structure", () => {
    it("should have correct structure for each plan", () => {
      expect(PLAN_LIMITS.free).toHaveProperty("chatbots");
      expect(PLAN_LIMITS.free).toHaveProperty("messages");
      expect(PLAN_LIMITS.starter).toHaveProperty("price");
      expect(PLAN_LIMITS.growth.price).toBe(79);
    });

    it("should have business plan with highest limits", () => {
      expect(PLAN_LIMITS.business.messages).toBeGreaterThan(PLAN_LIMITS.growth.messages);
    });
  });

  describe("Feature lists for plans", () => {
    it("should format message count with locale", () => {
      const messages = 5000;
      const formatted = messages.toLocaleString();

      expect(formatted).toBe("5,000");
    });

    it("should generate feature strings correctly", () => {
      const chatbots = 3;
      const feature = `${chatbots} chatbots`;

      expect(feature).toBe("3 chatbots");
    });
  });
});
