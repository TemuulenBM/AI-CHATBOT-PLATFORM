import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { validatePaddleWebhookOrigin } from "../../../server/middleware/paddleWebhookValidator";

// Mock paddleService
vi.mock("../../../server/services/paddle", () => ({
  paddleService: {
    verifyWebhookSignature: vi.fn(),
  },
}));

import { paddleService } from "../../../server/services/paddle";

// Helper factories
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    rawBody: Buffer.from("test body"),
    ip: "127.0.0.1",
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

describe("Paddle Webhook Validator", () => {
  let mockNext: NextFunction;
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.PADDLE_WEBHOOK_SECRET;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
    process.env.NODE_ENV = "production";
    process.env.PADDLE_WEBHOOK_SECRET = "test-webhook-secret";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.PADDLE_WEBHOOK_SECRET = originalSecret;
  });

  describe("Signature Validation", () => {
    it("should validate webhook with correct signature", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const req = createMockRequest({
        headers: { "paddle-signature": "valid-signature" },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(paddleService.verifyWebhookSignature).toHaveBeenCalledWith(
        req.rawBody,
        "valid-signature"
      );
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should reject webhook with invalid signature", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(false);

      const req = createMockRequest({
        headers: { "paddle-signature": "invalid-signature" },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(403);
      expect(res._json.error).toBe("Invalid webhook signature");
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 400 when signature header is missing", () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Missing webhook signature");
      expect(mockNext).not.toHaveBeenCalled();
      expect(paddleService.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    it("should return 400 when raw body is missing", () => {
      const req = createMockRequest({
        headers: { "paddle-signature": "some-signature" },
        rawBody: undefined,
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Missing request body");
      expect(mockNext).not.toHaveBeenCalled();
      expect(paddleService.verifyWebhookSignature).not.toHaveBeenCalled();
    });
  });

  describe("Development Environment", () => {
    it("should skip validation in development when secret is not configured", () => {
      process.env.NODE_ENV = "development";
      delete process.env.PADDLE_WEBHOOK_SECRET;

      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(paddleService.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    it("should validate in development when secret is configured", () => {
      process.env.NODE_ENV = "development";
      process.env.PADDLE_WEBHOOK_SECRET = "test-secret";

      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const req = createMockRequest({
        headers: { "paddle-signature": "valid-signature" },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(paddleService.verifyWebhookSignature).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should always validate in production", () => {
      process.env.NODE_ENV = "production";

      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("Security", () => {
    it("should log warning for missing signature", () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(400);
    });

    it("should log warning for invalid signature with IP", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(false);

      const req = createMockRequest({
        headers: { "paddle-signature": "bad-signature" },
        ip: "192.168.1.100",
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(403);
    });

    it("should log warning for missing raw body", () => {
      const req = createMockRequest({
        headers: { "paddle-signature": "some-signature" },
        rawBody: null as any,
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Missing request body");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty signature header", () => {
      const req = createMockRequest({
        headers: { "paddle-signature": "" },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Missing webhook signature");
    });

    it("should handle signature with whitespace", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const req = createMockRequest({
        headers: { "paddle-signature": "  valid-signature  " },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(paddleService.verifyWebhookSignature).toHaveBeenCalledWith(
        req.rawBody,
        "  valid-signature  "
      );
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should handle Buffer raw body", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const buffer = Buffer.from("webhook payload");
      const req = createMockRequest({
        headers: { "paddle-signature": "valid-signature" },
        rawBody: buffer,
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(paddleService.verifyWebhookSignature).toHaveBeenCalledWith(
        buffer,
        "valid-signature"
      );
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("Return Values", () => {
    it("should not call next() when signature is missing", () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should not call next() when body is missing", () => {
      const req = createMockRequest({
        headers: { "paddle-signature": "sig" },
        rawBody: undefined,
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should not call next() when signature is invalid", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(false);

      const req = createMockRequest({
        headers: { "paddle-signature": "invalid" },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next() when signature is valid", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const req = createMockRequest({
        headers: { "paddle-signature": "valid" },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
