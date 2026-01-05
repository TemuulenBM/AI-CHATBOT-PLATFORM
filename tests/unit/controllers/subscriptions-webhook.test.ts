import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { handleWebhook } from "../../../server/controllers/subscriptions";

// Mock paddleService
vi.mock("../../../server/services/paddle", () => ({
  paddleService: {
    handleWebhook: vi.fn(),
  },
}));

import { paddleService } from "../../../server/services/paddle";

// Helper factories
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    rawBody: Buffer.from("test body"),
    body: {},
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & { _json: any; _status: number } {
  const res = {
    _json: null,
    _status: 200,
    status: vi.fn(function (code: number) {
      res._status = code;
      return res;
    }),
    json: vi.fn(function (data: any) {
      res._json = data;
      return res;
    }),
  } as unknown as Response & { _json: any; _status: number };
  return res;
}

describe("Subscriptions Controller - Webhook Handler", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe("handleWebhook", () => {
    it("should process webhook with valid signature", async () => {
      vi.mocked(paddleService.handleWebhook).mockResolvedValue({
        received: true,
      });

      const req = createMockRequest({
        headers: { "paddle-signature": "valid-signature" },
        rawBody: Buffer.from(JSON.stringify({ event_type: "subscription.created" })),
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(paddleService.handleWebhook).toHaveBeenCalledWith(
        req.rawBody,
        "valid-signature"
      );
      expect(res._json).toEqual({ received: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 400 when signature header is missing", async () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._status).toBe(400);
      expect(res._json.message).toBe("Missing signature");
      expect(paddleService.handleWebhook).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 400 when signature is empty string", async () => {
      const req = createMockRequest({
        headers: { "paddle-signature": "" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._status).toBe(400);
      expect(res._json.message).toBe("Missing signature");
      expect(paddleService.handleWebhook).not.toHaveBeenCalled();
    });

    it("should call next with error when webhook processing fails", async () => {
      const error = new Error("Webhook processing failed");
      vi.mocked(paddleService.handleWebhook).mockRejectedValue(error);

      const req = createMockRequest({
        headers: { "paddle-signature": "valid-signature" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(res.json).not.toHaveBeenCalled();
    });

    it("should handle subscription.created event", async () => {
      const webhookResult = {
        received: true,
        eventType: "subscription.created",
      };

      vi.mocked(paddleService.handleWebhook).mockResolvedValue(webhookResult);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig-123" },
        rawBody: Buffer.from(
          JSON.stringify({
            event_type: "subscription.created",
            data: { subscription_id: "sub_123" },
          })
        ),
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._json).toEqual(webhookResult);
    });

    it("should handle subscription.updated event", async () => {
      const webhookResult = {
        received: true,
        eventType: "subscription.updated",
      };

      vi.mocked(paddleService.handleWebhook).mockResolvedValue(webhookResult);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig-456" },
        rawBody: Buffer.from(
          JSON.stringify({
            event_type: "subscription.updated",
            data: { subscription_id: "sub_123" },
          })
        ),
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._json).toEqual(webhookResult);
    });

    it("should handle subscription.canceled event", async () => {
      const webhookResult = {
        received: true,
        eventType: "subscription.canceled",
      };

      vi.mocked(paddleService.handleWebhook).mockResolvedValue(webhookResult);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig-789" },
        rawBody: Buffer.from(
          JSON.stringify({
            event_type: "subscription.canceled",
            data: { subscription_id: "sub_123" },
          })
        ),
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._json).toEqual(webhookResult);
    });

    it("should handle transaction.completed event", async () => {
      const webhookResult = {
        received: true,
        eventType: "transaction.completed",
      };

      vi.mocked(paddleService.handleWebhook).mockResolvedValue(webhookResult);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig-abc" },
        rawBody: Buffer.from(
          JSON.stringify({
            event_type: "transaction.completed",
            data: { transaction_id: "txn_123" },
          })
        ),
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._json).toEqual(webhookResult);
    });

    it("should handle subscription.past_due event", async () => {
      const webhookResult = {
        received: true,
        eventType: "subscription.past_due",
      };

      vi.mocked(paddleService.handleWebhook).mockResolvedValue(webhookResult);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig-def" },
        rawBody: Buffer.from(
          JSON.stringify({
            event_type: "subscription.past_due",
            data: { subscription_id: "sub_123" },
          })
        ),
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._json).toEqual(webhookResult);
    });

    it("should handle transaction.payment_failed event", async () => {
      const webhookResult = {
        received: true,
        eventType: "transaction.payment_failed",
      };

      vi.mocked(paddleService.handleWebhook).mockResolvedValue(webhookResult);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig-ghi" },
        rawBody: Buffer.from(
          JSON.stringify({
            event_type: "transaction.payment_failed",
            data: { transaction_id: "txn_456" },
          })
        ),
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._json).toEqual(webhookResult);
    });

    it("should pass raw body as Buffer to paddle service", async () => {
      const buffer = Buffer.from("webhook payload data");
      vi.mocked(paddleService.handleWebhook).mockResolvedValue({
        received: true,
      });

      const req = createMockRequest({
        headers: { "paddle-signature": "test-sig" },
        rawBody: buffer,
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(paddleService.handleWebhook).toHaveBeenCalledWith(
        buffer,
        "test-sig"
      );
    });

    it("should handle invalid signature error from paddle service", async () => {
      const error = new Error("Invalid webhook signature");
      vi.mocked(paddleService.handleWebhook).mockRejectedValue(error);

      const req = createMockRequest({
        headers: { "paddle-signature": "invalid-sig" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it("should handle duplicate event error gracefully", async () => {
      const error = new Error("Event already processed");
      vi.mocked(paddleService.handleWebhook).mockRejectedValue(error);

      const req = createMockRequest({
        headers: { "paddle-signature": "duplicate-sig" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it("should handle database error from paddle service", async () => {
      const error = new Error("Database connection failed");
      vi.mocked(paddleService.handleWebhook).mockRejectedValue(error);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe("Edge Cases", () => {
    it("should handle null signature header", async () => {
      const req = createMockRequest({
        headers: { "paddle-signature": null as any },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._status).toBe(400);
      expect(res._json.message).toBe("Missing signature");
    });

    it("should handle undefined signature header", async () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._status).toBe(400);
    });

    it("should handle large webhook payload", async () => {
      const largePayload = Buffer.from(JSON.stringify({
        event_type: "subscription.created",
        data: { description: "x".repeat(10000) },
      }));

      vi.mocked(paddleService.handleWebhook).mockResolvedValue({
        received: true,
      });

      const req = createMockRequest({
        headers: { "paddle-signature": "sig" },
        rawBody: largePayload,
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(paddleService.handleWebhook).toHaveBeenCalledWith(
        largePayload,
        "sig"
      );
      expect(res._json).toEqual({ received: true });
    });

    it("should handle special characters in signature", async () => {
      const signature = "ts=1234;h1=abc+def/xyz==";
      vi.mocked(paddleService.handleWebhook).mockResolvedValue({
        received: true,
      });

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(paddleService.handleWebhook).toHaveBeenCalledWith(
        req.rawBody,
        signature
      );
    });
  });

  describe("Response Handling", () => {
    it("should return exact response from paddle service", async () => {
      const customResponse = {
        received: true,
        custom: "data",
        nested: { value: 123 },
      };

      vi.mocked(paddleService.handleWebhook).mockResolvedValue(customResponse);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._json).toEqual(customResponse);
    });

    it("should not modify response from paddle service", async () => {
      const response = { received: true, eventId: "evt_123" };
      vi.mocked(paddleService.handleWebhook).mockResolvedValue(response);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(res._json).toStrictEqual(response);
    });
  });

  describe("Error Propagation", () => {
    it("should propagate network errors", async () => {
      const networkError = new Error("Network timeout");
      vi.mocked(paddleService.handleWebhook).mockRejectedValue(networkError);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(networkError);
    });

    it("should propagate validation errors", async () => {
      const validationError = new Error("Invalid event data");
      vi.mocked(paddleService.handleWebhook).mockRejectedValue(validationError);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(validationError);
    });

    it("should propagate unknown errors", async () => {
      const unknownError = new Error("Something went wrong");
      vi.mocked(paddleService.handleWebhook).mockRejectedValue(unknownError);

      const req = createMockRequest({
        headers: { "paddle-signature": "sig" },
      });
      const res = createMockResponse();

      await handleWebhook(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(unknownError);
    });
  });
});
