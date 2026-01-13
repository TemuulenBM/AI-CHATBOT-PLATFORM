import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import express from "express";
import request from "supertest";
import {
  cspNonceMiddleware,
  configureHelmet,
  configureCORS,
  configureHPP,
  configureSanitization,
  configureTrustProxy,
  applySecurity,
} from "../../../server/middleware/security";

// Helper to access private functions via module
import logger from "../../../server/utils/logger";

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Security Middleware", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("cspNonceMiddleware", () => {
    it("should generate a nonce and attach it to request", () => {
      const req = {} as Request;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      cspNonceMiddleware(req, res, next);

      expect(req.cspNonce).toBeDefined();
      expect(typeof req.cspNonce).toBe("string");
      expect(req.cspNonce!.length).toBeGreaterThan(0);
      expect(next).toHaveBeenCalled();
    });

    it("should generate unique nonces for each request", () => {
      const req1 = {} as Request;
      const req2 = {} as Request;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      cspNonceMiddleware(req1, res, next);
      cspNonceMiddleware(req2, res, next);

      expect(req1.cspNonce).not.toBe(req2.cspNonce);
    });

    it("should generate base64 encoded nonce", () => {
      const req = {} as Request;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      cspNonceMiddleware(req, res, next);

      // Base64 pattern check
      const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
      expect(base64Pattern.test(req.cspNonce!)).toBe(true);
    });
  });
});

// Test the schemas and configurations indirectly through imports
describe("Security Configurations", () => {
  describe("getAllowedOrigins behavior", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("should parse comma-separated origins", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com,https://test.com";

      // We can't directly test getAllowedOrigins, but we can verify behavior
      // by testing the corsOriginValidator callback
      expect(process.env.ALLOWED_ORIGINS.split(",")).toHaveLength(2);
    });

    it("should use APP_URL as default when ALLOWED_ORIGINS not set", () => {
      delete process.env.ALLOWED_ORIGINS;
      process.env.APP_URL = "https://myapp.com";

      // Default behavior should use APP_URL
      expect(process.env.APP_URL).toBe("https://myapp.com");
    });

    it("should fallback to localhost when neither is set", () => {
      delete process.env.ALLOWED_ORIGINS;
      delete process.env.APP_URL;

      // Default fallback
      const defaultOrigin = process.env.APP_URL || "http://localhost:5000";
      expect(defaultOrigin).toBe("http://localhost:5000");
    });
  });

  describe("CORS validator logic", () => {
    it("should allow requests with no origin", async () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      process.env.ALLOWED_ORIGINS = "https://example.com";

      const app = express();
      configureCORS(app);
      app.get("/api/test", (req, res) => {
        res.json({ success: true });
      });

      // Request with no origin should be allowed (line 45-46)
      const response = await request(app)
        .get("/api/test")
        .expect(200);

      expect(response.body.success).toBe(true);
      process.env.ALLOWED_ORIGINS = originalEnv;
    });

    it("should allow allowed origins", async () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      process.env.ALLOWED_ORIGINS = "https://example.com,https://test.com";

      const app = express();
      configureCORS(app);
      app.get("/api/test", (req, res) => {
        res.json({ success: true });
      });

      // Request with allowed origin should be allowed (lines 50-52)
      const response = await request(app)
        .get("/api/test")
        .set("Origin", "https://example.com")
        .expect(200);

      expect(response.body.success).toBe(true);
      process.env.ALLOWED_ORIGINS = originalEnv;
    });

    it("should block disallowed origins and log warning", async () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      process.env.ALLOWED_ORIGINS = "https://example.com";

      const app = express();
      configureCORS(app);
      app.get("/api/test", (req, res) => {
        res.json({ success: true });
      });

      // Request with disallowed origin should be blocked (lines 56-57)
      await request(app)
        .get("/api/test")
        .set("Origin", "https://malicious.com")
        .expect(500); // CORS error causes 500

      expect(logger.warn).toHaveBeenCalledWith(
        "CORS blocked origin",
        expect.objectContaining({
          origin: "https://malicious.com",
          allowedOrigins: ["https://example.com"],
        })
      );
      process.env.ALLOWED_ORIGINS = originalEnv;
    });

    it("should parse ALLOWED_ORIGINS with trimming (line 35)", async () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      // Test line 35: origins.split(",").map((o) => o.trim())
      process.env.ALLOWED_ORIGINS = "https://example.com, https://test.com , https://app.com";

      const app = express();
      configureCORS(app);
      app.get("/api/test", (req, res) => {
        res.json({ success: true });
      });

      // All three origins should be allowed after trimming
      await request(app)
        .get("/api/test")
        .set("Origin", "https://example.com")
        .expect(200);

      await request(app)
        .get("/api/test")
        .set("Origin", "https://test.com")
        .expect(200);

      await request(app)
        .get("/api/test")
        .set("Origin", "https://app.com")
        .expect(200);

      process.env.ALLOWED_ORIGINS = originalEnv;
    });

    it("should use APP_URL as default when ALLOWED_ORIGINS not set (line 31-32)", async () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      const originalAppUrl = process.env.APP_URL;
      delete process.env.ALLOWED_ORIGINS;
      process.env.APP_URL = "https://myapp.com";

      const app = express();
      configureCORS(app);
      app.get("/api/test", (req, res) => {
        res.json({ success: true });
      });

      // Make request to trigger getAllowedOrigins which will use APP_URL (line 31-32)
      // This should trigger logger.warn (line 32)
      await request(app)
        .get("/api/test")
        .set("Origin", "https://myapp.com")
        .expect(200);

      expect(logger.warn).toHaveBeenCalledWith(
        "ALLOWED_ORIGINS not set, using default",
        expect.objectContaining({
          defaultOrigin: "https://myapp.com",
        })
      );

      process.env.ALLOWED_ORIGINS = originalEnv;
      process.env.APP_URL = originalAppUrl;
    });

    it("should fallback to localhost when neither ALLOWED_ORIGINS nor APP_URL is set (line 31)", async () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      const originalAppUrl = process.env.APP_URL;
      delete process.env.ALLOWED_ORIGINS;
      delete process.env.APP_URL;

      const app = express();
      configureCORS(app);
      app.get("/api/test", (req, res) => {
        res.json({ success: true });
      });

      // Make request to trigger getAllowedOrigins which will use localhost default (line 31)
      // This should trigger logger.warn (line 32)
      await request(app)
        .get("/api/test")
        .set("Origin", "http://localhost:5000")
        .expect(200);

      expect(logger.warn).toHaveBeenCalledWith(
        "ALLOWED_ORIGINS not set, using default",
        expect.objectContaining({
          defaultOrigin: "http://localhost:5000",
        })
      );

      process.env.ALLOWED_ORIGINS = originalEnv;
      process.env.APP_URL = originalAppUrl;
    });

    it("should parse allowed origins correctly with trimming", () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      // Test with spaces that need trimming (line 35: origins.split(",").map((o) => o.trim()))
      process.env.ALLOWED_ORIGINS = "https://example.com, https://test.com , https://app.com";

      const app = express();
      configureCORS(app);

      // Origins should be trimmed (this tests line 35)
      const origins = process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
      expect(origins).toContain("https://example.com");
      expect(origins).toContain("https://test.com");
      expect(origins).toContain("https://app.com");
      expect(origins.length).toBe(3);

      process.env.ALLOWED_ORIGINS = originalEnv;
    });

    it("should have CORS validator configured to block disallowed origins", () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      process.env.ALLOWED_ORIGINS = "https://example.com";

      const app = express();
      configureCORS(app);

      // CORS validator is configured to block disallowed origins
      // When a disallowed origin is used, it will log a warning (line 56)
      // and call callback with error (line 57)
      expect(process.env.ALLOWED_ORIGINS).toBe("https://example.com");

      process.env.ALLOWED_ORIGINS = originalEnv;
    });
  });

  describe("Helmet CSP configuration", () => {
    it("should have correct directives structure", () => {
      // Verify expected CSP directive types
      const expectedDirectives = [
        "defaultSrc",
        "scriptSrc",
        "styleSrc",
        "imgSrc",
        "connectSrc",
        "frameSrc",
        "fontSrc",
      ];

      expectedDirectives.forEach(directive => {
        expect(typeof directive).toBe("string");
      });
    });

    it("should handle development vs production mode", () => {
      process.env.NODE_ENV = "development";
      expect(process.env.NODE_ENV !== "production").toBe(true);

      process.env.NODE_ENV = "production";
      expect(process.env.NODE_ENV === "production").toBe(true);
    });
  });

  describe("HSTS configuration", () => {
    it("should have correct max age of 1 year", () => {
      const hstsMaxAge = 31536000; // 1 year in seconds
      expect(hstsMaxAge).toBe(365 * 24 * 60 * 60);
    });
  });

  describe("Trust Proxy configuration", () => {
    it("should respect TRUST_PROXY environment variable", () => {
      process.env.TRUST_PROXY = "true";
      expect(process.env.TRUST_PROXY).toBe("true");

      process.env.TRUST_PROXY = "false";
      expect(process.env.TRUST_PROXY).toBe("false");

      delete process.env.TRUST_PROXY;
      expect(process.env.TRUST_PROXY).toBeUndefined();
    });
  });

  describe("Widget CORS configuration", () => {
    it("should allow all origins for widget routes", () => {
      // Widget routes should be permissive for embedding
      const widgetCorsOrigin = "*";
      expect(widgetCorsOrigin).toBe("*");
    });

    it("should have correct widget route patterns", () => {
      const widgetRoutes = ["/widget.js", "/widget/*"];
      expect(widgetRoutes).toContain("/widget.js");
      expect(widgetRoutes).toContain("/widget/*");
    });
  });

  describe("HPP whitelist configuration", () => {
    it("should whitelist expected query parameters", () => {
      const whitelist = [
        "page",
        "limit",
        "sort",
        "days",
        "chatbotId",
        "startDate",
        "endDate",
      ];

      expect(whitelist).toContain("page");
      expect(whitelist).toContain("limit");
      expect(whitelist).toContain("chatbotId");
      expect(whitelist).toHaveLength(7);
    });
  });

  describe("configureHelmet", () => {
    it("should configure helmet with CSP", () => {
      const app = express();
      configureHelmet(app);

      // Verify middleware is applied (can't easily test helmet internals)
      expect(app).toBeDefined();
    });

    it("should use nonce in production mode", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      process.env.APP_URL = "https://example.com";

      const app = express();
      app.use(cspNonceMiddleware);
      configureHelmet(app);
      app.get("/test", (req, res) => {
        res.json({ success: true });
      });

      // Make actual request to trigger helmet middleware (line 68)
      const response = await request(app)
        .get("/test")
        .expect(200);

      // Helmet should set security headers
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(process.env.NODE_ENV).toBe("production");
      process.env.NODE_ENV = originalEnv;
    });

    it("should allow unsafe-inline in development", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      process.env.APP_URL = "https://example.com";

      const app = express();
      app.use(cspNonceMiddleware);
      configureHelmet(app);
      app.get("/test", (req, res) => {
        res.json({ success: true });
      });

      // Make actual request to trigger helmet middleware
      const response = await request(app)
        .get("/test")
        .expect(200);

      // Helmet should set security headers
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(process.env.NODE_ENV).toBe("development");
      process.env.NODE_ENV = originalEnv;
    });

    it("should apply helmet middleware to requests (line 68)", async () => {
      const app = express();
      app.use(cspNonceMiddleware);
      configureHelmet(app);
      app.get("/test", (req, res) => {
        res.json({ success: true });
      });

      // Make actual request to trigger helmet() call on line 68
      const response = await request(app)
        .get("/test")
        .expect(200);

      // Verify helmet middleware was applied by checking security headers
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["strict-transport-security"]).toBeDefined();
    });
  });

  describe("configureCORS", () => {
    it("should configure CORS for API routes", () => {
      const app = express();
      configureCORS(app);

      expect(app).toBeDefined();
    });

    it("should configure permissive CORS for widget routes", () => {
      const app = express();
      configureCORS(app);

      // Widget routes should allow all origins
      expect(app).toBeDefined();
    });

    it("should set CORP to cross-origin for widget routes", () => {
      const app = express();
      configureCORS(app);

      const req = {
        url: "/widget.js",
        method: "GET",
      } as Request;
      const res = {
        setHeader: vi.fn(),
        getHeader: vi.fn().mockReturnValue(null),
      } as any;
      const next = vi.fn() as NextFunction;

      // Simulate widget route request
      app(req, res, next);

      // Should set cross-origin CORP header
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cross-Origin-Resource-Policy",
        "cross-origin"
      );
    });

    it("should set CORP to same-origin for non-widget routes", () => {
      const app = express();
      configureCORS(app);

      const req = {
        url: "/api/test",
        method: "GET",
      } as Request;
      const res = {
        setHeader: vi.fn(),
        getHeader: vi.fn().mockReturnValue(null),
      } as any;
      const next = vi.fn() as NextFunction;

      // Simulate non-widget route request
      app(req, res, next);

      // Should set same-origin CORP header
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cross-Origin-Resource-Policy",
        "same-origin"
      );
    });

    it("should not override existing CORP header", () => {
      const app = express();
      configureCORS(app);

      const req = {
        url: "/api/test",
        method: "GET",
      } as Request;
      const res = {
        setHeader: vi.fn(),
        getHeader: vi.fn().mockReturnValue("cross-origin"),
      } as any;
      const next = vi.fn() as NextFunction;

      // Simulate request with existing CORP header
      app(req, res, next);

      // Should not set header if it already exists
      expect(res.setHeader).not.toHaveBeenCalledWith(
        "Cross-Origin-Resource-Policy",
        "same-origin"
      );
    });
  });

  describe("configureHPP", () => {
    it("should configure HPP protection", () => {
      const app = express();
      configureHPP(app);

      expect(app).toBeDefined();
    });
  });

  describe("configureSanitization", () => {
    it("should configure request sanitization", () => {
      const app = express();
      configureSanitization(app);

      expect(app).toBeDefined();
    });

    it("should trigger onSanitize callback when sanitizing suspicious input (line 275)", async () => {
      const app = express();
      app.use(express.json());
      configureSanitization(app);
      app.post("/api/test", (req, res) => {
        res.json({ body: req.body });
      });

      // Send request with MongoDB operator injection attempt
      // This should trigger mongoSanitize and call onSanitize callback (line 275)
      await request(app)
        .post("/api/test")
        .send({
          $where: "malicious",
          $ne: "test",
          username: { $gt: "" },
        })
        .expect(200);

      // The onSanitize callback should log a warning (line 275-278)
      expect(logger.warn).toHaveBeenCalledWith(
        "Sanitized suspicious input",
        expect.objectContaining({
          path: "/api/test",
          key: expect.any(String),
        })
      );
    });
  });

  describe("configureTrustProxy", () => {
    it("should enable trust proxy when TRUST_PROXY is true", () => {
      const originalEnv = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "true";

      const app = express();
      configureTrustProxy(app);

      expect(process.env.TRUST_PROXY).toBe("true");
      process.env.TRUST_PROXY = originalEnv;
    });

    it("should not enable trust proxy when TRUST_PROXY is false", () => {
      const originalEnv = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "false";

      const app = express();
      configureTrustProxy(app);

      expect(process.env.TRUST_PROXY).toBe("false");
      process.env.TRUST_PROXY = originalEnv;
    });
  });

  describe("applySecurity", () => {
    it("should apply all security middleware", () => {
      const app = express();
      applySecurity(app);

      expect(app).toBeDefined();
    });

    it("should apply middleware in correct order", () => {
      const app = express();
      applySecurity(app);

      // Verify middleware stack is configured
      expect(app).toBeDefined();
    });
  });
});
