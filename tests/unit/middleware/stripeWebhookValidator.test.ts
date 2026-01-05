import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { validateStripeWebhookOrigin } from "../../../server/middleware/stripeWebhookValidator";

// Mock logger
vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import logger from "../../../server/utils/logger";

describe("Stripe Webhook Validator", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it("should allow requests in development", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    mockReq = {
      ip: "192.168.1.1",
    };

    validateStripeWebhookOrigin(
      mockReq as Request,
      mockRes as Response,
      mockNext
    );

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it("should allow requests from valid Stripe IPs in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    mockReq = {
      ip: "3.18.12.63", // Valid Stripe IP
    };

    validateStripeWebhookOrigin(
      mockReq as Request,
      mockRes as Response,
      mockNext
    );

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it("should reject requests from invalid IPs in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    mockReq = {
      ip: "192.168.1.1", // Invalid IP
    };

    validateStripeWebhookOrigin(
      mockReq as Request,
      mockRes as Response,
      mockNext
    );

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: "Unauthorized webhook origin",
    });
    expect(logger.warn).toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it("should handle IPv6-mapped IPv4 addresses", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    mockReq = {
      ip: "::ffff:3.18.12.63", // IPv6-mapped IPv4
    };

    validateStripeWebhookOrigin(
      mockReq as Request,
      mockRes as Response,
      mockNext
    );

    expect(mockNext).toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it("should handle missing IP address", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    mockReq = {
      ip: undefined,
      socket: { remoteAddress: undefined } as any,
    };

    validateStripeWebhookOrigin(
      mockReq as Request,
      mockRes as Response,
      mockNext
    );

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);

    process.env.NODE_ENV = originalEnv;
  });

  it("should use socket.remoteAddress as fallback", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    mockReq = {
      ip: undefined,
      socket: { remoteAddress: "3.18.12.63" } as any,
    };

    validateStripeWebhookOrigin(
      mockReq as Request,
      mockRes as Response,
      mockNext
    );

    expect(mockNext).toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });
});

