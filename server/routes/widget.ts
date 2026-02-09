import { Router, Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as esbuild from "esbuild";
import { getChatbotPublic } from "../controllers/chatbots";
import { validate, schemas } from "../middleware/validation";
import { apiRateLimit } from "../middleware/rateLimit";
import logger from "../utils/logger";

const router = Router();

// Cache for built widgets
interface WidgetCache {
  content: string;
  integrity: string;
  timestamp: number;
}

let widgetCache: WidgetCache | null = null;
let loaderCache: WidgetCache | null = null;
const CACHE_TTL = process.env.NODE_ENV === "production" ? 3600 * 1000 : 60 * 1000; // 1 hour prod, 1 min dev

// Get the branding URL from environment
function getBrandingUrl(): string {
  return process.env.WIDGET_POWERED_BY_URL || process.env.APP_URL || "https://chatai.com";
}

// Generate SRI integrity hash
function generateIntegrity(content: string): string {
  const hash = crypto.createHash("sha384").update(content).digest("base64");
  return `sha384-${hash}`;
}

async function getWidgetScript(): Promise<WidgetCache> {
  const now = Date.now();
  const brandingUrl = getBrandingUrl();

  // Check cache
  if (widgetCache && now - widgetCache.timestamp < CACHE_TTL) {
    return widgetCache;
  }

  // Try to read pre-built widget
  const prebuiltPath = path.join(process.cwd(), "dist/widget/widget.js");
  if (fs.existsSync(prebuiltPath)) {
    let script = fs.readFileSync(prebuiltPath, "utf-8");
    script = script.replace(/__WIDGET_POWERED_BY_URL__/g, brandingUrl);

    widgetCache = {
      content: script,
      integrity: generateIntegrity(script),
      timestamp: now,
    };
    return widgetCache;
  }

  // Build on-the-fly in development
  const widgetSourcePath = path.join(process.cwd(), "widget/src/index.ts");
  if (fs.existsSync(widgetSourcePath)) {
    const result = await esbuild.build({
      entryPoints: [widgetSourcePath],
      bundle: true,
      minify: process.env.NODE_ENV === "production",
      sourcemap: false,
      target: ["es2018"],
      format: "iife",
      write: false,
    });

    let script = result.outputFiles[0].text;
    script = script.replace(/__WIDGET_POWERED_BY_URL__/g, brandingUrl);

    widgetCache = {
      content: script,
      integrity: generateIntegrity(script),
      timestamp: now,
    };
    return widgetCache;
  }

  // Fallback to old widget location
  const legacyPath = path.join(process.cwd(), "widget/chatbot-widget.ts");
  if (fs.existsSync(legacyPath)) {
    const result = await esbuild.build({
      entryPoints: [legacyPath],
      bundle: true,
      minify: process.env.NODE_ENV === "production",
      sourcemap: false,
      target: ["es2018"],
      format: "iife",
      write: false,
    });

    let script = result.outputFiles[0].text;
    script = script.replace(/__WIDGET_POWERED_BY_URL__/g, brandingUrl);

    widgetCache = {
      content: script,
      integrity: generateIntegrity(script),
      timestamp: now,
    };
    return widgetCache;
  }

  throw new Error("Widget source not found");
}

async function getLoaderScript(): Promise<WidgetCache> {
  const now = Date.now();

  // Check cache
  if (loaderCache && now - loaderCache.timestamp < CACHE_TTL) {
    return loaderCache;
  }

  // Try to read pre-built loader
  const prebuiltPath = path.join(process.cwd(), "dist/widget/loader.js");
  if (fs.existsSync(prebuiltPath)) {
    const script = fs.readFileSync(prebuiltPath, "utf-8");

    loaderCache = {
      content: script,
      integrity: generateIntegrity(script),
      timestamp: now,
    };
    return loaderCache;
  }

  // Build on-the-fly
  const loaderSourcePath = path.join(process.cwd(), "widget/src/loader.ts");
  if (fs.existsSync(loaderSourcePath)) {
    const result = await esbuild.build({
      entryPoints: [loaderSourcePath],
      bundle: true,
      minify: true,
      sourcemap: false,
      target: ["es2018"],
      format: "iife",
      write: false,
    });

    loaderCache = {
      content: result.outputFiles[0].text,
      integrity: generateIntegrity(result.outputFiles[0].text),
      timestamp: now,
    };
    return loaderCache;
  }

  throw new Error("Loader source not found");
}

// GET /widget.js - Serve the full widget script
router.get("/widget.js", async (req: Request, res: Response) => {
  try {
    const { content, integrity } = await getWidgetScript();

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600"); // 1 hour cache
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Send integrity in header for clients that want to verify
    res.setHeader("X-Script-Integrity", integrity);

    res.send(content);
  } catch (error) {
    logger.error("Failed to serve widget", { error, path: "/widget.js" });
    res.status(500).send("// Widget failed to load");
  }
});

// GET /widget/loader.js - Serve the tiny async loader
router.get("/widget/loader.js", async (req: Request, res: Response) => {
  try {
    const { content, integrity } = await getLoaderScript();

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400"); // 24 hour cache (loader changes less often)
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Script-Integrity", integrity);

    res.send(content);
  } catch (error) {
    logger.error("Failed to serve loader", { error, path: "/widget/loader.js" });
    res.status(500).send("// Loader failed to load");
  }
});

// GET /widget/widget.js - Alternative path for full widget
router.get("/widget/widget.js", async (req: Request, res: Response) => {
  try {
    const { content, integrity } = await getWidgetScript();

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Script-Integrity", integrity);

    res.send(content);
  } catch (error) {
    logger.error("Failed to serve widget", { error, path: "/widget/widget.js" });
    res.status(500).send("// Widget failed to load");
  }
});

// GET /widget/manifest.json - Serve the build manifest with integrity hashes
router.get("/widget/manifest.json", async (req: Request, res: Response) => {
  try {
    const manifestPath = path.join(process.cwd(), "dist/widget/manifest.json");

    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      res.json(manifest);
    } else {
      // Generate manifest on-the-fly
      const [widget, loader] = await Promise.all([getWidgetScript(), getLoaderScript()]);

      res.json({
        version: "2.0.0",
        files: {
          "widget.js": {
            integrity: widget.integrity,
            size: Buffer.byteLength(widget.content),
          },
          "loader.js": {
            integrity: loader.integrity,
            size: Buffer.byteLength(loader.content),
          },
        },
      });
    }
  } catch (error) {
    logger.error("Failed to serve manifest", { error, path: "/widget/manifest.json" });
    res.status(500).json({ error: "Failed to load manifest" });
  }
});

// GET /widget/preview - Redirect to new demo page
// UUID validation нэмсэн — validate хийхгүй бол open redirect эрсдэлтэй
router.get("/widget/preview", (req: Request, res: Response) => {
  const chatbotId = req.query.id;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (chatbotId && !uuidRegex.test(chatbotId as string)) {
    res.status(400).json({ error: "Invalid chatbot ID format" });
    return;
  }
  const safeId = chatbotId || "demo-chatbot-id";
  res.redirect(`/widget/demo?id=${safeId}`);
});

// GET /widget/:id - Get chatbot config for widget
// Exclude "demo" - that's handled by the frontend React app
router.get("/widget/:id", (req: Request, res: Response, next: NextFunction) => {
  if (req.params.id === "demo") {
    // Let this fall through to Vite/static file server for React app
    return next();
  }
  return getChatbotPublic(req, res, next);
});

// POST /widget/analytics - Receive widget analytics events
// Zod validation нэмсэн — бүтэцгүй data DB руу бичигдэхээс хамгаална
// Rate limit нэмсэн — DDoS/spam хамгаалалт
router.post("/widget/analytics", apiRateLimit, validate({ body: schemas.widgetAnalyticsEvent }), async (req: Request, res: Response) => {
  try {
    const { chatbotId, sessionId, events } = req.body;

    logger.debug("Widget analytics received", { chatbotId, sessionId, eventCount: events.length });

    // Import analytics service dynamically to avoid circular dependencies
    const widgetAnalytics = await import("../services/widget-analytics");

    // Track all events in batch
    await widgetAnalytics.trackEvents(chatbotId, sessionId, events);

    res.status(204).send();
  } catch (error) {
    logger.error("Failed to process analytics", { error, chatbotId: req.body?.chatbotId });
    res.status(500).json({ error: "Failed to process analytics" });
  }
});

// POST /widget/errors - Receive widget error reports
router.post("/widget/errors", async (req: Request, res: Response) => {
  try {
    const { chatbotId, sessionId, error: widgetError } = req.body;

    // Log widget errors with structured data
    logger.error("Widget error reported", {
      category: "widget_error",
      chatbotId,
      sessionId,
      message: widgetError?.message,
      stack: widgetError?.stack,
      widgetVersion: widgetError?.widgetVersion,
      userAgent: widgetError?.userAgent,
    });

    // Track error as analytics event
    const widgetAnalytics = await import("../services/widget-analytics");
    await widgetAnalytics.trackEvent(chatbotId, sessionId, {
      event_name: "widget_error",
      event_category: "error",
      properties: {
        error_message: widgetError?.message,
        error_stack: widgetError?.stack?.substring(0, 500), // Limit stack trace size
        widget_version: widgetError?.widgetVersion,
        user_agent: widgetError?.userAgent,
      },
    });

    res.status(204).send();
  } catch (error) {
    logger.error("Failed to process error report", { error, chatbotId: req.body?.chatbotId });
    res.status(500).json({ error: "Failed to process error" });
  }
});



export default router;
