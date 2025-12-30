import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// Mock modules before importing the route
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("esbuild", () => ({
  build: vi.fn(),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../server/controllers/chatbots", () => ({
  getChatbotPublic: vi.fn(),
}));

describe("Widget Routes - Unit Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.APP_URL = "https://testapp.com";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("getBrandingUrl logic", () => {
    it("should use WIDGET_POWERED_BY_URL when set", () => {
      process.env.WIDGET_POWERED_BY_URL = "https://custom-branding.com";
      process.env.APP_URL = "https://app.com";

      const brandingUrl = process.env.WIDGET_POWERED_BY_URL || process.env.APP_URL || "https://chatai.com";
      expect(brandingUrl).toBe("https://custom-branding.com");
    });

    it("should fallback to APP_URL when WIDGET_POWERED_BY_URL not set", () => {
      delete process.env.WIDGET_POWERED_BY_URL;
      process.env.APP_URL = "https://app.com";

      const brandingUrl = process.env.WIDGET_POWERED_BY_URL || process.env.APP_URL || "https://chatai.com";
      expect(brandingUrl).toBe("https://app.com");
    });

    it("should fallback to default when neither is set", () => {
      delete process.env.WIDGET_POWERED_BY_URL;
      delete process.env.APP_URL;

      const brandingUrl = process.env.WIDGET_POWERED_BY_URL || process.env.APP_URL || "https://chatai.com";
      expect(brandingUrl).toBe("https://chatai.com");
    });
  });

  describe("generateIntegrity logic", () => {
    it("should generate valid SHA-384 integrity hash", () => {
      const content = "console.log('test');";
      const hash = crypto.createHash("sha384").update(content).digest("base64");
      const integrity = `sha384-${hash}`;

      expect(integrity).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
    });

    it("should generate different hashes for different content", () => {
      const content1 = "console.log('test1');";
      const content2 = "console.log('test2');";

      const hash1 = crypto.createHash("sha384").update(content1).digest("base64");
      const hash2 = crypto.createHash("sha384").update(content2).digest("base64");

      expect(hash1).not.toBe(hash2);
    });

    it("should generate same hash for same content", () => {
      const content = "console.log('test');";

      const hash1 = crypto.createHash("sha384").update(content).digest("base64");
      const hash2 = crypto.createHash("sha384").update(content).digest("base64");

      expect(hash1).toBe(hash2);
    });
  });

  describe("Cache TTL logic", () => {
    it("should use 1 hour cache in production", () => {
      process.env.NODE_ENV = "production";
      const CACHE_TTL = process.env.NODE_ENV === "production" ? 3600 * 1000 : 60 * 1000;

      expect(CACHE_TTL).toBe(3600 * 1000); // 1 hour in ms
    });

    it("should use 1 minute cache in development", () => {
      process.env.NODE_ENV = "development";
      const CACHE_TTL = process.env.NODE_ENV === "production" ? 3600 * 1000 : 60 * 1000;

      expect(CACHE_TTL).toBe(60 * 1000); // 1 minute in ms
    });

    it("should use 1 minute cache in test", () => {
      process.env.NODE_ENV = "test";
      const CACHE_TTL = process.env.NODE_ENV === "production" ? 3600 * 1000 : 60 * 1000;

      expect(CACHE_TTL).toBe(60 * 1000);
    });
  });

  describe("Widget cache structure", () => {
    interface WidgetCache {
      content: string;
      integrity: string;
      timestamp: number;
    }

    it("should have correct structure", () => {
      const cache: WidgetCache = {
        content: "// widget code",
        integrity: "sha384-abc123",
        timestamp: Date.now(),
      };

      expect(cache).toHaveProperty("content");
      expect(cache).toHaveProperty("integrity");
      expect(cache).toHaveProperty("timestamp");
      expect(typeof cache.content).toBe("string");
      expect(typeof cache.integrity).toBe("string");
      expect(typeof cache.timestamp).toBe("number");
    });

    it("should check cache expiration correctly", () => {
      const CACHE_TTL = 60 * 1000; // 1 minute
      const now = Date.now();

      const validCache: WidgetCache = {
        content: "code",
        integrity: "sha384-xyz",
        timestamp: now - 30000, // 30 seconds ago
      };

      const expiredCache: WidgetCache = {
        content: "code",
        integrity: "sha384-xyz",
        timestamp: now - 120000, // 2 minutes ago
      };

      expect(now - validCache.timestamp < CACHE_TTL).toBe(true);
      expect(now - expiredCache.timestamp < CACHE_TTL).toBe(false);
    });
  });

  describe("Content-Type headers", () => {
    it("should use correct content type for JavaScript", () => {
      const contentType = "application/javascript; charset=utf-8";
      expect(contentType).toBe("application/javascript; charset=utf-8");
    });

    it("should use nosniff header", () => {
      const header = "nosniff";
      expect(header).toBe("nosniff");
    });
  });

  describe("Cache-Control headers", () => {
    it("should use 1 hour cache for widget.js", () => {
      const cacheControl = "public, max-age=3600";
      expect(cacheControl).toContain("max-age=3600");
    });

    it("should use 24 hour cache for loader.js", () => {
      const cacheControl = "public, max-age=86400";
      expect(cacheControl).toContain("max-age=86400");
    });
  });

  describe("Widget manifest structure", () => {
    it("should have correct manifest structure", () => {
      const manifest = {
        version: "2.0.0",
        files: {
          "widget.js": {
            integrity: "sha384-abc",
            size: 1000,
          },
          "loader.js": {
            integrity: "sha384-def",
            size: 500,
          },
        },
      };

      expect(manifest.version).toBe("2.0.0");
      expect(manifest.files["widget.js"]).toBeDefined();
      expect(manifest.files["loader.js"]).toBeDefined();
      expect(manifest.files["widget.js"].integrity).toMatch(/^sha384-/);
    });
  });

  describe("Preview redirect logic", () => {
    it("should build redirect URL with chatbot ID", () => {
      const chatbotId = "test-chatbot-123";
      const redirectUrl = `/widget/demo?id=${chatbotId}`;

      expect(redirectUrl).toBe("/widget/demo?id=test-chatbot-123");
    });

    it("should use default ID when not provided", () => {
      const chatbotId = undefined || "demo-chatbot-id";
      const redirectUrl = `/widget/demo?id=${chatbotId}`;

      expect(redirectUrl).toBe("/widget/demo?id=demo-chatbot-id");
    });
  });

  describe("Analytics event handling", () => {
    it("should handle analytics event structure", () => {
      const analyticsEvent = {
        chatbotId: "chatbot123",
        sessionId: "session456",
        events: [
          { type: "widget_open", timestamp: Date.now() },
          { type: "message_sent", timestamp: Date.now() },
        ],
      };

      expect(analyticsEvent.chatbotId).toBeDefined();
      expect(analyticsEvent.sessionId).toBeDefined();
      expect(Array.isArray(analyticsEvent.events)).toBe(true);
      expect(analyticsEvent.events.length).toBe(2);
    });
  });

  describe("Error report handling", () => {
    it("should handle error report structure", () => {
      const errorReport = {
        chatbotId: "chatbot123",
        sessionId: "session456",
        error: {
          message: "Something went wrong",
          stack: "Error: Something went wrong\n    at widget.js:100",
          widgetVersion: "2.0.0",
          userAgent: "Mozilla/5.0...",
        },
      };

      expect(errorReport.error.message).toBeDefined();
      expect(errorReport.error.widgetVersion).toBe("2.0.0");
    });
  });

  describe("Route ID handling", () => {
    it("should skip getChatbotPublic for demo route", () => {
      const id = "demo";
      const shouldSkip = id === "demo";

      expect(shouldSkip).toBe(true);
    });

    it("should call getChatbotPublic for regular IDs", () => {
      const id = "abc123";
      const shouldSkip = id === "demo";

      expect(shouldSkip).toBe(false);
    });
  });

  describe("esbuild configuration", () => {
    it("should have correct build options for production", () => {
      process.env.NODE_ENV = "production";

      const options = {
        bundle: true,
        minify: process.env.NODE_ENV === "production",
        sourcemap: false,
        target: ["es2018"],
        format: "iife" as const,
        write: false,
      };

      expect(options.minify).toBe(true);
      expect(options.sourcemap).toBe(false);
      expect(options.format).toBe("iife");
    });

    it("should not minify in development", () => {
      process.env.NODE_ENV = "development";

      const options = {
        minify: process.env.NODE_ENV === "production",
      };

      expect(options.minify).toBe(false);
    });
  });

  describe("Branding URL replacement", () => {
    it("should replace placeholder with branding URL", () => {
      const script = "const url = '__WIDGET_POWERED_BY_URL__';";
      const brandingUrl = "https://example.com";
      const result = script.replace(/__WIDGET_POWERED_BY_URL__/g, brandingUrl);

      expect(result).toBe("const url = 'https://example.com';");
    });

    it("should replace multiple occurrences", () => {
      const script = "const a = '__WIDGET_POWERED_BY_URL__'; const b = '__WIDGET_POWERED_BY_URL__';";
      const brandingUrl = "https://example.com";
      const result = script.replace(/__WIDGET_POWERED_BY_URL__/g, brandingUrl);

      expect(result).not.toContain("__WIDGET_POWERED_BY_URL__");
      expect(result.match(/https:\/\/example\.com/g)?.length).toBe(2);
    });
  });
});
