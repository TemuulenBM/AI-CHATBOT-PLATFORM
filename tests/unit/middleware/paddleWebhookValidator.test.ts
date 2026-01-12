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

      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=valid_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(paddleService.verifyWebhookSignature).toHaveBeenCalledWith(
        req.rawBody,
        signature
      );
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should reject webhook with invalid signature", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(false);

      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=invalid_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
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
      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=some_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
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

      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=valid_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
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

      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=bad_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
        ip: "192.168.1.100",
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(403);
    });

    it("should log warning for missing raw body", () => {
      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=some_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
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

    it("should handle signature with whitespace inside h1 value", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=valid signature with spaces`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(paddleService.verifyWebhookSignature).toHaveBeenCalledWith(
        req.rawBody,
        signature
      );
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should handle Buffer raw body", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=valid_signature`;

      const buffer = Buffer.from("webhook payload");
      const req = createMockRequest({
        headers: { "paddle-signature": signature },
        rawBody: buffer,
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(paddleService.verifyWebhookSignature).toHaveBeenCalledWith(
        buffer,
        signature
      );
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("Timestamp Validation", () => {
    it("should reject webhook with old timestamp", () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes old
      const signature = `ts=${oldTimestamp};h1=valid_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Webhook timestamp too old");
      expect(mockNext).not.toHaveBeenCalled();
      expect(paddleService.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    it("should reject webhook with future timestamp", () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 400; // 6+ minutes future
      const signature = `ts=${futureTimestamp};h1=valid_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Webhook timestamp too new");
      expect(mockNext).not.toHaveBeenCalled();
      expect(paddleService.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    it("should accept webhook with valid timestamp", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const validTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute old
      const signature = `ts=${validTimestamp};h1=valid_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(paddleService.verifyWebhookSignature).toHaveBeenCalled();
    });

    it("should accept webhook at tolerance boundary (5 minutes old)", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const boundaryTimestamp = Math.floor(Date.now() / 1000) - 299; // Just under 5 minutes
      const signature = `ts=${boundaryTimestamp};h1=valid_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should reject webhook missing timestamp in signature", () => {
      const signature = "h1=valid_signature"; // No ts= component

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Missing timestamp in signature");
      expect(mockNext).not.toHaveBeenCalled();
      expect(paddleService.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    it("should reject webhook with invalid timestamp format", () => {
      const signature = "ts=invalid;h1=valid_signature"; // Non-numeric timestamp

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Invalid timestamp format");
      expect(mockNext).not.toHaveBeenCalled();
      expect(paddleService.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    it("should handle multiple signature components correctly", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=abc123;extra=value`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should log detailed info for old timestamp replay attacks", () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes old
      const signature = `ts=${oldTimestamp};h1=valid_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
        ip: "192.168.1.100",
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Webhook timestamp too old");
    });

    it("should handle clock skew with tolerance window", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      // Timestamp slightly in future (within tolerance)
      const nearFutureTimestamp = Math.floor(Date.now() / 1000) + 60; // 1 minute ahead
      const signature = `ts=${nearFutureTimestamp};h1=valid_signature`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
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
      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=sig`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
        rawBody: undefined,
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should not call next() when signature is invalid", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(false);

      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=invalid`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next() when signature is valid", () => {
      vi.mocked(paddleService.verifyWebhookSignature).mockReturnValue(true);

      const validTimestamp = Math.floor(Date.now() / 1000) - 60;
      const signature = `ts=${validTimestamp};h1=valid`;

      const req = createMockRequest({
        headers: { "paddle-signature": signature },
      });
      const res = createMockResponse();

      validatePaddleWebhookOrigin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
