import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as esbuild from "esbuild";

// Mock modules before importing
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("path", () => ({
  join: vi.fn((...args) => args.join("/")),
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
  getChatbotPublic: vi.fn((req: any, res: any, next: any) => {
    res.json({ id: req.params.id, name: "Test Chatbot" });
  }),
}));

// Redis mock — widget route-д validation, rateLimit import нэмсэн тул
// redis.ts → email.ts → new Resend() шаарддаг
vi.mock("../../../server/utils/redis", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetIn: 60 }),
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCachePattern: vi.fn().mockResolvedValue(undefined),
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
}));

vi.mock("../../../server/services/widget-analytics", () => ({
  trackEvents: vi.fn().mockResolvedValue(undefined),
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

import logger from "../../../server/utils/logger";
import { getChatbotPublic } from "../../../server/controllers/chatbots";
import * as widgetAnalytics from "../../../server/services/widget-analytics";

describe("Widget Routes", () => {
  let app: express.Application;
  let widgetRoutes: any;
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules(); // Reset modules to clear cache between tests
    process.env.NODE_ENV = "test";
    process.env.APP_URL = "https://testapp.com";
    delete process.env.WIDGET_POWERED_BY_URL;

    // Import routes after resetting modules
    const widgetModule = await import("../../../server/routes/widget");
    widgetRoutes = widgetModule.default;

    app = express();
    app.use(express.json());
    app.use("/", widgetRoutes);
    // Error handler — validate middleware ValidationError throw хийхэд
    // response буцаахад ашиглагдана
    app.use((err: any, _req: any, res: any, _next: any) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({ message: err.message, error: err.message });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
    process.cwd = originalCwd;
  });

  describe("GET /widget.js", () => {
    it("should serve widget script from cache when available", async () => {
      const mockScript = "console.log('widget');";
      const mockIntegrity = `sha384-${crypto.createHash("sha384").update(mockScript).digest("base64")}`;

      // Mock cache by setting up file system to return prebuilt
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      const response = await request(app).get("/widget.js");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("application/javascript; charset=utf-8");
      expect(response.headers["cache-control"]).toBe("public, max-age=3600");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-script-integrity"]).toBe(mockIntegrity);
      expect(response.text).toBe(mockScript);
    });

    it("should serve widget script from prebuilt path", async () => {
      const mockScript = "console.log('prebuilt widget');";
      const mockIntegrity = `sha384-${crypto.createHash("sha384").update(mockScript).digest("base64")}`;

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return String(filePath).includes("dist/widget/widget.js");
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      const response = await request(app).get("/widget.js");

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockScript);
      expect(response.headers["x-script-integrity"]).toBe(mockIntegrity);
    });

    it("should build widget from source path in development", async () => {
      const mockScript = "console.log('built widget');";
      const mockIntegrity = `sha384-${crypto.createHash("sha384").update(mockScript).digest("base64")}`;

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return String(filePath).includes("widget/src/index.ts");
      });

      vi.mocked(esbuild.build).mockResolvedValue({
        outputFiles: [{ text: mockScript }],
        warnings: [],
        errors: [],
      } as any);

      const response = await request(app).get("/widget.js");

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockScript);
      expect(response.headers["x-script-integrity"]).toBe(mockIntegrity);
      expect(esbuild.build).toHaveBeenCalled();
    });

    it("should build widget from legacy path when source not found", async () => {
      const mockScript = "console.log('legacy widget');";
      const mockIntegrity = `sha384-${crypto.createHash("sha384").update(mockScript).digest("base64")}`;

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return String(filePath).includes("widget/chatbot-widget.ts");
      });

      vi.mocked(esbuild.build).mockResolvedValue({
        outputFiles: [{ text: mockScript }],
        warnings: [],
        errors: [],
      } as any);

      const response = await request(app).get("/widget.js");

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockScript);
      expect(response.headers["x-script-integrity"]).toBe(mockIntegrity);
    });

    it("should replace branding URL placeholder in script", async () => {
      const mockScript = "const url = '__WIDGET_POWERED_BY_URL__';";
      const brandingUrl = "https://custom.com";

      process.env.WIDGET_POWERED_BY_URL = brandingUrl;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      const response = await request(app).get("/widget.js");

      expect(response.status).toBe(200);
      expect(response.text).toContain(brandingUrl);
      expect(response.text).not.toContain("__WIDGET_POWERED_BY_URL__");
    });

    it("should handle errors and return 500", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await request(app).get("/widget.js");

      expect(response.status).toBe(500);
      expect(response.text).toBe("// Widget failed to load");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to serve widget",
        expect.objectContaining({
          error: expect.any(Error),
          path: "/widget.js",
        })
      );
    });

    it("should use cache when within TTL", async () => {
      const mockScript = "console.log('cached');";
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      // First request
      await request(app).get("/widget.js");

      // Second request should use cache (no new file reads)
      vi.mocked(fs.existsSync).mockClear();
      vi.mocked(fs.readFileSync).mockClear();

      const response = await request(app).get("/widget.js");

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockScript);
    });
  });

  describe("GET /widget/loader.js", () => {
    it("should serve loader script from prebuilt path", async () => {
      const mockScript = "console.log('loader');";
      const mockIntegrity = `sha384-${crypto.createHash("sha384").update(mockScript).digest("base64")}`;

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return String(filePath).includes("dist/widget/loader.js");
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      const response = await request(app).get("/widget/loader.js");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("application/javascript; charset=utf-8");
      expect(response.headers["cache-control"]).toBe("public, max-age=86400");
      expect(response.headers["x-script-integrity"]).toBe(mockIntegrity);
      expect(response.text).toBe(mockScript);
    });

    it("should build loader from source path", async () => {
      const mockScript = "console.log('built loader');";
      const mockIntegrity = `sha384-${crypto.createHash("sha384").update(mockScript).digest("base64")}`;

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return String(filePath).includes("widget/src/loader.ts");
      });

      vi.mocked(esbuild.build).mockResolvedValue({
        outputFiles: [{ text: mockScript }],
        warnings: [],
        errors: [],
      } as any);

      const response = await request(app).get("/widget/loader.js");

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockScript);
      expect(response.headers["x-script-integrity"]).toBe(mockIntegrity);
      expect(esbuild.build).toHaveBeenCalledWith(
        expect.objectContaining({
          minify: true,
        })
      );
    });

    it("should handle errors and return 500", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await request(app).get("/widget/loader.js");

      expect(response.status).toBe(500);
      expect(response.text).toBe("// Loader failed to load");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to serve loader",
        expect.objectContaining({
          error: expect.any(Error),
          path: "/widget/loader.js",
        })
      );
    });

    it("should use cache when within TTL", async () => {
      const mockScript = "console.log('cached loader');";
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      await request(app).get("/widget/loader.js");

      vi.mocked(fs.existsSync).mockClear();
      vi.mocked(fs.readFileSync).mockClear();

      const response = await request(app).get("/widget/loader.js");

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockScript);
    });
  });

  describe("GET /widget/widget.js", () => {
    it("should serve widget script", async () => {
      const mockScript = "console.log('widget alt path');";
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      const response = await request(app).get("/widget/widget.js");

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockScript);
      expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    });

    it("should handle errors and return 500", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await request(app).get("/widget/widget.js");

      expect(response.status).toBe(500);
      expect(response.text).toBe("// Widget failed to load");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to serve widget",
        expect.objectContaining({
          error: expect.any(Error),
          path: "/widget/widget.js",
        })
      );
    });
  });

  describe("GET /widget/manifest.json", () => {
    it("should serve manifest from file when exists", async () => {
      const mockManifest = {
        version: "2.0.0",
        files: {
          "widget.js": { integrity: "sha384-abc", size: 1000 },
          "loader.js": { integrity: "sha384-def", size: 500 },
        },
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return String(filePath).includes("dist/widget/manifest.json");
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockManifest));

      const response = await request(app).get("/widget/manifest.json");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockManifest);
    });

    it("should generate manifest on-the-fly when file not found", async () => {
      const widgetScript = "console.log('widget');";
      const loaderScript = "console.log('loader');";
      const widgetIntegrity = `sha384-${crypto.createHash("sha384").update(widgetScript).digest("base64")}`;
      const loaderIntegrity = `sha384-${crypto.createHash("sha384").update(loaderScript).digest("base64")}`;

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        if (pathStr.includes("manifest.json")) return false;
        if (pathStr.includes("widget.js")) return true;
        if (pathStr.includes("loader.js")) return true;
        return false;
      });

      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        if (pathStr.includes("widget.js")) return widgetScript;
        if (pathStr.includes("loader.js")) return loaderScript;
        return "";
      });

      const response = await request(app).get("/widget/manifest.json");

      expect(response.status).toBe(200);
      expect(response.body.version).toBe("2.0.0");
      expect(response.body.files["widget.js"].integrity).toBe(widgetIntegrity);
      expect(response.body.files["loader.js"].integrity).toBe(loaderIntegrity);
      expect(response.body.files["widget.js"].size).toBe(Buffer.byteLength(widgetScript));
      expect(response.body.files["loader.js"].size).toBe(Buffer.byteLength(loaderScript));
    });

    it("should handle errors and return 500", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await request(app).get("/widget/manifest.json");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to load manifest");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to serve manifest",
        expect.objectContaining({
          error: expect.any(Error),
          path: "/widget/manifest.json",
        })
      );
    });
  });

  describe("GET /widget/preview", () => {
    it("should redirect to demo page with valid UUID chatbot ID", async () => {
      const validId = "11111111-1111-1111-1111-111111111111";
      const response = await request(app)
        .get("/widget/preview")
        .query({ id: validId });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/widget/demo?id=${validId}`);
    });

    it("should return 400 for invalid chatbot ID format", async () => {
      const response = await request(app)
        .get("/widget/preview")
        .query({ id: "invalid-not-uuid" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid chatbot ID format");
    });

    it("should use default ID when not provided", async () => {
      const response = await request(app).get("/widget/preview");

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe("/widget/demo?id=demo-chatbot-id");
    });
  });

  describe("GET /widget/:id", () => {
    it("should skip getChatbotPublic for demo route", async () => {
      const response = await request(app).get("/widget/demo");

      // Should not call getChatbotPublic, should fall through (404 or handled by other middleware)
      expect(getChatbotPublic).not.toHaveBeenCalled();
    });

    it("should call getChatbotPublic for regular IDs", async () => {
      const response = await request(app).get("/widget/chatbot-123");

      expect(response.status).toBe(200);
      expect(response.body.id).toBe("chatbot-123");
      expect(getChatbotPublic).toHaveBeenCalled();
    });
  });

  describe("POST /widget/analytics", () => {
    // UUID format chatbotId ашиглах — Zod validation шаарддаг
    const validChatbotId = "11111111-1111-1111-1111-111111111111";

    it("should process analytics events successfully", async () => {
      const events = [
        { event_name: "widget_opened", event_category: "engagement" },
        { event_name: "message_sent", event_category: "engagement" },
      ];

      const response = await request(app)
        .post("/widget/analytics")
        .send({
          chatbotId: validChatbotId,
          sessionId: "session-456",
          events,
        });

      expect(response.status).toBe(204);
      expect(widgetAnalytics.trackEvents).toHaveBeenCalledWith(validChatbotId, "session-456", events);
      expect(logger.debug).toHaveBeenCalledWith(
        "Widget analytics received",
        expect.objectContaining({
          chatbotId: validChatbotId,
          sessionId: "session-456",
          eventCount: 2,
        })
      );
    });

    it("should return 400 when chatbotId is missing", async () => {
      const response = await request(app)
        .post("/widget/analytics")
        .send({
          sessionId: "session-456",
          events: [{ event_name: "test" }],
        });

      expect(response.status).toBe(400);
      // Zod validation нь message field-д алдааг буцаана
      expect(response.body.message).toBeDefined();
      expect(widgetAnalytics.trackEvents).not.toHaveBeenCalled();
    });

    it("should return 400 when sessionId is missing", async () => {
      const response = await request(app)
        .post("/widget/analytics")
        .send({
          chatbotId: validChatbotId,
          events: [{ event_name: "test" }],
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBeDefined();
    });

    it("should return 400 when events is not an array", async () => {
      const response = await request(app)
        .post("/widget/analytics")
        .send({
          chatbotId: validChatbotId,
          sessionId: "session-456",
          events: "not-an-array",
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBeDefined();
    });

    it("should handle errors and return 500", async () => {
      vi.mocked(widgetAnalytics.trackEvents).mockRejectedValue(new Error("Service error"));

      const response = await request(app)
        .post("/widget/analytics")
        .send({
          chatbotId: validChatbotId,
          sessionId: "session-456",
          events: [{ event_name: "test" }],
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to process analytics");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to process analytics",
        expect.objectContaining({
          error: expect.any(Error),
          chatbotId: validChatbotId,
        })
      );
    });
  });

  describe("POST /widget/errors", () => {
    it("should process error reports successfully", async () => {
      const errorReport = {
        chatbotId: "chatbot-123",
        sessionId: "session-456",
        error: {
          message: "Something went wrong",
          stack: "Error: Something went wrong\n    at widget.js:100",
          widgetVersion: "2.0.0",
          userAgent: "Mozilla/5.0",
        },
      };

      const response = await request(app)
        .post("/widget/errors")
        .send(errorReport);

      expect(response.status).toBe(204);
      expect(logger.error).toHaveBeenCalledWith(
        "Widget error reported",
        expect.objectContaining({
          category: "widget_error",
          chatbotId: "chatbot-123",
          sessionId: "session-456",
          message: "Something went wrong",
          stack: expect.stringContaining("Error: Something went wrong"),
          widgetVersion: "2.0.0",
          userAgent: "Mozilla/5.0",
        })
      );
      expect(widgetAnalytics.trackEvent).toHaveBeenCalledWith(
        "chatbot-123",
        "session-456",
        expect.objectContaining({
          event_name: "widget_error",
          event_category: "error",
          properties: expect.objectContaining({
            error_message: "Something went wrong",
            widget_version: "2.0.0",
            user_agent: "Mozilla/5.0",
          }),
        })
      );
    });

    it("should limit stack trace size to 500 characters", async () => {
      const longStack = "Error: Test\n" + "    at line 1\n".repeat(100);
      const errorReport = {
        chatbotId: "chatbot-123",
        sessionId: "session-456",
        error: {
          message: "Test error",
          stack: longStack,
        },
      };

      await request(app)
        .post("/widget/errors")
        .send(errorReport);

      expect(widgetAnalytics.trackEvent).toHaveBeenCalledWith(
        "chatbot-123",
        "session-456",
        expect.objectContaining({
          properties: expect.objectContaining({
            error_stack: expect.any(String),
          }),
        })
      );

      // Verify the stack was actually truncated
      const callArgs = vi.mocked(widgetAnalytics.trackEvent).mock.calls[0];
      const properties = callArgs[2]?.properties;
      expect(properties).toBeDefined();
      expect(typeof properties?.error_stack === "string" ? properties.error_stack.length : 0).toBeLessThanOrEqual(500);
    });

    it("should handle missing error fields gracefully", async () => {
      const errorReport = {
        chatbotId: "chatbot-123",
        sessionId: "session-456",
        error: {},
      };

      const response = await request(app)
        .post("/widget/errors")
        .send(errorReport);

      expect(response.status).toBe(204);
      expect(logger.error).toHaveBeenCalled();
      expect(widgetAnalytics.trackEvent).toHaveBeenCalled();
    });

    it("should handle errors and return 500", async () => {
      vi.mocked(widgetAnalytics.trackEvent).mockRejectedValue(new Error("Service error"));

      const response = await request(app)
        .post("/widget/errors")
        .send({
          chatbotId: "chatbot-123",
          sessionId: "session-456",
          error: { message: "Test error" },
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to process error");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to process error report",
        expect.objectContaining({
          error: expect.any(Error),
          chatbotId: "chatbot-123",
        })
      );
    });
  });

  describe("getBrandingUrl function", () => {
    it("should use WIDGET_POWERED_BY_URL when set", async () => {
      process.env.WIDGET_POWERED_BY_URL = "https://custom-branding.com";
      process.env.APP_URL = "https://app.com";

      const mockScript = "const url = '__WIDGET_POWERED_BY_URL__';";
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      const response = await request(app).get("/widget.js");

      expect(response.text).toContain("https://custom-branding.com");
      expect(response.text).not.toContain("https://app.com");
    });

    it("should fallback to APP_URL when WIDGET_POWERED_BY_URL not set", async () => {
      delete process.env.WIDGET_POWERED_BY_URL;
      process.env.APP_URL = "https://app.com";

      const mockScript = "const url = '__WIDGET_POWERED_BY_URL__';";
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      const response = await request(app).get("/widget.js");

      expect(response.text).toContain("https://app.com");
    });

    it("should fallback to default when neither is set", async () => {
      delete process.env.WIDGET_POWERED_BY_URL;
      delete process.env.APP_URL;

      const mockScript = "const url = '__WIDGET_POWERED_BY_URL__';";
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      const response = await request(app).get("/widget.js");

      expect(response.text).toContain("https://chatai.com");
    });
  });

  describe("Cache behavior", () => {
    it("should use different TTL in production", async () => {
      process.env.NODE_ENV = "production";
      const mockScript = "console.log('test');";
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      // First request
      await request(app).get("/widget.js");

      // Advance time beyond dev TTL but within prod TTL
      vi.useFakeTimers();
      vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      // Should still use cache in production
      vi.mocked(fs.existsSync).mockClear();
      vi.mocked(fs.readFileSync).mockClear();

      const response = await request(app).get("/widget.js");

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockScript);

      vi.useRealTimers();
    });

    it("should expire cache after TTL in development", async () => {
      process.env.NODE_ENV = "development";
      const mockScript = "console.log('test');";
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockScript);

      // First request
      await request(app).get("/widget.js");

      // Advance time beyond dev TTL
      vi.useFakeTimers();
      vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      // Should rebuild (read file again)
      const response = await request(app).get("/widget.js");

      expect(response.status).toBe(200);
      expect(fs.readFileSync).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("esbuild configuration", () => {
    it("should minify in production", async () => {
      process.env.NODE_ENV = "production";
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return String(filePath).includes("widget/src/index.ts");
      });

      vi.mocked(esbuild.build).mockResolvedValue({
        outputFiles: [{ text: "minified code" }],
        warnings: [],
        errors: [],
      } as any);

      await request(app).get("/widget.js");

      expect(esbuild.build).toHaveBeenCalledWith(
        expect.objectContaining({
          minify: true,
        })
      );
    });

    it("should not minify in development", async () => {
      process.env.NODE_ENV = "development";
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return String(filePath).includes("widget/src/index.ts");
      });

      vi.mocked(esbuild.build).mockResolvedValue({
        outputFiles: [{ text: "unminified code" }],
        warnings: [],
        errors: [],
      } as any);

      await request(app).get("/widget.js");

      expect(esbuild.build).toHaveBeenCalledWith(
        expect.objectContaining({
          minify: false,
        })
      );
    });
  });
});
