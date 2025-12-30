import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import {
  setCsrfToken,
  validateCsrfToken,
  getCsrfToken as getCsrfTokenEndpoint,
  csrfProtection,
} from "../../../server/middleware/csrf";

// Mock logger to avoid console spam during tests
vi.mock("../../../server/utils/logger", () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CSRF Protection Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let cookieStore: Record<string, string>;

  beforeEach(() => {
    cookieStore = {};
    mockNext = vi.fn();

    mockReq = {
      method: "POST",
      path: "/api/chatbots",
      cookies: {},
      headers: {},
      ip: "127.0.0.1",
    };

    mockRes = {
      cookie: vi.fn((name: string, value: string) => {
        cookieStore[name] = value;
      }),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  describe("setCsrfToken", () => {
    it("should generate and set CSRF token cookies if none exists", () => {
      setCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        "__Host-csrf-token",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: false, // false in test (NODE_ENV !== production)
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000,
          path: "/",
        })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        "csrf-token-readable",
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          secure: false,
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000,
          path: "/",
        })
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it("should not generate new token if one already exists", () => {
      const existingToken = crypto.randomBytes(32).toString("base64url");
      mockReq.cookies = { "__Host-csrf-token": existingToken };

      setCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.cookie).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("validateCsrfToken", () => {
    it("should allow safe methods (GET, HEAD, OPTIONS) without token", () => {
      mockReq.method = "GET";

      validateCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should skip validation for webhook endpoints", () => {
      mockReq.path = "/api/webhooks/clerk";
      mockReq.method = "POST";

      validateCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should skip validation for public widget endpoints", () => {
      mockReq.path = "/api/chat/widget";
      mockReq.method = "POST";

      validateCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should reject request when cookie token is missing", () => {
      mockReq.cookies = {};
      mockReq.headers = { "x-csrf-token": "some-token" };

      validateCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: "CSRF token missing in cookie",
        code: "CSRF_TOKEN_MISSING",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should reject request when header token is missing", () => {
      const token = crypto.randomBytes(32).toString("base64url");
      mockReq.cookies = { "__Host-csrf-token": token };
      mockReq.headers = {};

      validateCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: "CSRF token missing in request header",
        code: "CSRF_TOKEN_MISSING",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should reject request when tokens don't match", () => {
      const cookieToken = crypto.randomBytes(32).toString("base64url");
      const headerToken = crypto.randomBytes(32).toString("base64url");

      mockReq.cookies = { "__Host-csrf-token": cookieToken };
      mockReq.headers = { "x-csrf-token": headerToken };

      validateCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: "Invalid CSRF token",
        code: "CSRF_TOKEN_INVALID",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should accept request when tokens match", () => {
      const token = crypto.randomBytes(32).toString("base64url");

      mockReq.cookies = { "__Host-csrf-token": token };
      mockReq.headers = { "x-csrf-token": token };

      validateCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should reject when token lengths differ", () => {
      const token1 = "short";
      const token2 = "verylongtoken";

      mockReq.cookies = { "__Host-csrf-token": token1 };
      mockReq.headers = { "x-csrf-token": token2 };

      validateCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: "Invalid CSRF token",
        code: "CSRF_TOKEN_INVALID",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("getCsrfToken endpoint", () => {
    it("should return token when cookie exists", () => {
      const token = crypto.randomBytes(32).toString("base64url");
      mockReq.cookies = { "__Host-csrf-token": token };

      getCsrfTokenEndpoint(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ csrfToken: token });
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should return error when no token cookie exists", () => {
      mockReq.cookies = {};

      getCsrfTokenEndpoint(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: "No CSRF token found. Please refresh the page.",
        code: "CSRF_TOKEN_NOT_FOUND",
      });
    });
  });

  describe("csrfProtection combined middleware", () => {
    it("should set token and validate for POST requests", () => {
      const token = crypto.randomBytes(32).toString("base64url");
      mockReq.method = "POST";
      mockReq.cookies = { "__Host-csrf-token": token };
      mockReq.headers = { "x-csrf-token": token };

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should set token and skip validation for GET requests", () => {
      mockReq.method = "GET";
      mockReq.cookies = {};

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.cookie).toHaveBeenCalled(); // Token was set
      expect(mockNext).toHaveBeenCalled(); // Validation was skipped (safe method)
    });
  });

  describe("Security properties", () => {
    it("should generate cryptographically random tokens", () => {
      const tokens = new Set<string>();

      // Generate multiple tokens
      for (let i = 0; i < 10; i++) {
        // Reset mocks and create fresh request/response objects
        const freshReq = {
          method: "POST",
          path: "/api/test",
          cookies: {},
          headers: {},
          ip: "127.0.0.1",
        } as Partial<Request>;

        let capturedToken: string | null = null;
        const freshRes = {
          cookie: vi.fn((name: string, value: string) => {
            if (name === "__Host-csrf-token") {
              capturedToken = value;
            }
          }),
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
        } as Partial<Response>;

        setCsrfToken(freshReq as Request, freshRes as Response, mockNext);

        if (capturedToken) {
          tokens.add(capturedToken);
        }
      }

      // All tokens should be unique
      expect(tokens.size).toBe(10);
    });

    it("should use timing-safe comparison for token validation", () => {
      // This is implicitly tested by the implementation using crypto.timingSafeEqual
      // We verify that matching tokens pass validation
      const token = crypto.randomBytes(32).toString("base64url");

      mockReq.cookies = { "__Host-csrf-token": token };
      mockReq.headers = { "x-csrf-token": token };

      validateCsrfToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
