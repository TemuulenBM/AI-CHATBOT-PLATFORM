import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import express from "express";

// Mock dependencies before imports
vi.mock("helmet", () => ({
  default: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock("cors", () => ({
  default: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock("hpp", () => ({
  default: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock("express-mongo-sanitize", () => ({
  default: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
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
  cspNonceMiddleware,
  configureHelmet,
  configureCORS,
  configureHPP,
  configureSanitization,
  configureTrustProxy,
  applySecurity,
} from "../../../server/middleware/security";
import logger from "../../../server/utils/logger";

describe("Security Middleware - Direct Import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.TRUST_PROXY;
    delete process.env.APP_URL;
  });

  describe("cspNonceMiddleware", () => {
    it("should generate a cspNonce on request", () => {
      const mockReq = {} as Request;
      const mockRes = {} as Response;
      const mockNext = vi.fn();

      cspNonceMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.cspNonce).toBeDefined();
      expect(typeof mockReq.cspNonce).toBe("string");
      expect(mockReq.cspNonce!.length).toBeGreaterThan(0);
      expect(mockNext).toHaveBeenCalled();
    });

    it("should generate unique nonces for different requests", () => {
      const req1 = {} as Request;
      const req2 = {} as Request;
      const mockRes = {} as Response;
      const mockNext = vi.fn();

      cspNonceMiddleware(req1, mockRes, mockNext);
      cspNonceMiddleware(req2, mockRes, mockNext);

      expect(req1.cspNonce).not.toBe(req2.cspNonce);
    });
  });

  describe("configureHelmet", () => {
    it("should configure helmet on express app", () => {
      const app = express();

      expect(() => configureHelmet(app)).not.toThrow();
      expect(logger.info).toHaveBeenCalledWith(
        "Helmet security headers configured with CSP nonce support"
      );
    });
  });

  describe("configureCORS", () => {
    it("should configure CORS on express app", () => {
      const app = express();

      expect(() => configureCORS(app)).not.toThrow();
      expect(logger.info).toHaveBeenCalledWith(
        "CORS and CORP policies configured"
      );
    });
  });

  describe("configureHPP", () => {
    it("should configure HPP protection", () => {
      const app = express();

      expect(() => configureHPP(app)).not.toThrow();
      expect(logger.info).toHaveBeenCalledWith("HPP protection configured");
    });
  });

  describe("configureSanitization", () => {
    it("should configure request sanitization", () => {
      const app = express();

      expect(() => configureSanitization(app)).not.toThrow();
      expect(logger.info).toHaveBeenCalledWith("Request sanitization configured");
    });
  });

  describe("configureTrustProxy", () => {
    it("should not enable trust proxy by default", () => {
      const app = express();
      const setSpy = vi.spyOn(app, "set");

      configureTrustProxy(app);

      expect(setSpy).not.toHaveBeenCalledWith("trust proxy", 1);
    });

    it("should enable trust proxy when TRUST_PROXY is true", () => {
      process.env.TRUST_PROXY = "true";
      const app = express();
      const setSpy = vi.spyOn(app, "set");

      configureTrustProxy(app);

      expect(setSpy).toHaveBeenCalledWith("trust proxy", 1);
      expect(logger.info).toHaveBeenCalledWith("Trust proxy enabled");
    });
  });

  describe("applySecurity", () => {
    it("should apply all security middleware", () => {
      const app = express();

      expect(() => applySecurity(app)).not.toThrow();
      expect(logger.info).toHaveBeenCalledWith("Applying security middleware...");
      expect(logger.info).toHaveBeenCalledWith(
        "All security middleware applied with CSP nonce support"
      );
    });
  });
});
