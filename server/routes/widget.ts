import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as esbuild from "esbuild";
import { getChatbotPublic } from "../controllers/chatbots";

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
  const crypto = require("crypto");
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
    console.error("Failed to serve widget:", error);
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
    console.error("Failed to serve loader:", error);
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
    console.error("Failed to serve widget:", error);
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
    console.error("Failed to serve manifest:", error);
    res.status(500).json({ error: "Failed to load manifest" });
  }
});

// GET /widget/:id - Get chatbot config for widget
router.get("/widget/:id", getChatbotPublic);

// POST /widget/analytics - Receive widget analytics events
router.post("/widget/analytics", (req: Request, res: Response) => {
  try {
    const { chatbotId, sessionId, events } = req.body;

    // Log analytics (in production, you'd store these)
    if (process.env.NODE_ENV !== "production") {
      console.log("Widget analytics:", { chatbotId, sessionId, eventCount: events?.length });
    }

    // TODO: Store analytics in database
    // await analyticsService.trackWidgetEvents(chatbotId, sessionId, events);

    res.status(204).send();
  } catch (error) {
    console.error("Failed to process analytics:", error);
    res.status(500).json({ error: "Failed to process analytics" });
  }
});

// POST /widget/errors - Receive widget error reports
router.post("/widget/errors", (req: Request, res: Response) => {
  try {
    const { chatbotId, sessionId, error } = req.body;

    // Log errors
    console.error("Widget error:", {
      chatbotId,
      sessionId,
      message: error?.message,
      stack: error?.stack,
      widgetVersion: error?.widgetVersion,
      userAgent: error?.userAgent,
    });

    // TODO: Store errors in database or send to error tracking service
    // await errorService.trackWidgetError(chatbotId, sessionId, error);

    res.status(204).send();
  } catch (error) {
    console.error("Failed to process error report:", error);
    res.status(500).json({ error: "Failed to process error" });
  }
});

// GET /widget/demo - Demo page to test the widget
router.get("/widget/demo", (req: Request, res: Response) => {
  const chatbotId = req.query.id || "demo-chatbot-id";
  const useLoader = req.query.loader === "true";
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  const scriptTag = useLoader
    ? `<script async src="${baseUrl}/widget/loader.js" data-chatbot-id="${chatbotId}"></script>`
    : `<script async src="${baseUrl}/widget.js" data-chatbot-id="${chatbotId}"></script>`;

  res.setHeader("Content-Type", "text/html");
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ConvoAI Widget Demo</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: white;
    }
    .container {
      text-align: center;
      max-width: 700px;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }
    p {
      font-size: 1.2rem;
      opacity: 0.9;
      margin-bottom: 2rem;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin: 2rem 0;
      text-align: left;
    }
    .feature {
      background: rgba(255,255,255,0.1);
      padding: 16px;
      border-radius: 8px;
    }
    .feature h3 {
      font-size: 1rem;
      margin-bottom: 4px;
    }
    .feature p {
      font-size: 0.85rem;
      margin: 0;
      opacity: 0.8;
    }
    .code-block {
      background: rgba(0,0,0,0.3);
      padding: 20px;
      border-radius: 12px;
      text-align: left;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 13px;
      overflow-x: auto;
      margin-top: 2rem;
    }
    .code-block code {
      color: #a5f3fc;
    }
    .highlight {
      color: #fcd34d;
    }
    .api-demo {
      margin-top: 2rem;
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .api-demo button {
      padding: 10px 20px;
      border-radius: 8px;
      border: none;
      background: rgba(255,255,255,0.2);
      color: white;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }
    .api-demo button:hover {
      background: rgba(255,255,255,0.3);
    }
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 1rem;
    }
    .tab {
      padding: 8px 16px;
      border-radius: 6px;
      background: rgba(255,255,255,0.1);
      color: white;
      border: none;
      cursor: pointer;
      font-size: 14px;
    }
    .tab.active {
      background: rgba(255,255,255,0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>ConvoAI Widget v2.0</h1>
    <p>Industry-standard embeddable chat widget with Shadow DOM, accessibility, and full JavaScript API.</p>

    <div class="features">
      <div class="feature">
        <h3>Shadow DOM</h3>
        <p>Complete style isolation</p>
      </div>
      <div class="feature">
        <h3>Accessible</h3>
        <p>WCAG 2.1 AA compliant</p>
      </div>
      <div class="feature">
        <h3>Async Loading</h3>
        <p>Non-blocking script</p>
      </div>
      <div class="feature">
        <h3>JavaScript API</h3>
        <p>Full programmatic control</p>
      </div>
      <div class="feature">
        <h3>Markdown</h3>
        <p>Rich message formatting</p>
      </div>
      <div class="feature">
        <h3>i18n Ready</h3>
        <p>Multi-language support</p>
      </div>
    </div>

    <div class="api-demo">
      <button onclick="ConvoAI('open')">Open Widget</button>
      <button onclick="ConvoAI('close')">Close Widget</button>
      <button onclick="ConvoAI('toggle')">Toggle Widget</button>
      <button onclick="ConvoAI('sendMessage', 'Hello from the API!')">Send Message</button>
      <button onclick="ConvoAI('identify', {name: 'Demo User', email: 'demo@example.com'})">Identify User</button>
    </div>

    <div class="code-block">
      <code>
&lt;!-- Standard embed (recommended) --&gt;<br>
&lt;script <span class="highlight">async</span><br>
&nbsp;&nbsp;src="<span class="highlight">${baseUrl}/widget.js</span>"<br>
&nbsp;&nbsp;data-chatbot-id="<span class="highlight">${chatbotId}</span>"<br>
&gt;&lt;/script&gt;<br><br>

&lt;!-- Lazy loading (smaller initial load) --&gt;<br>
&lt;script <span class="highlight">async</span><br>
&nbsp;&nbsp;src="<span class="highlight">${baseUrl}/widget/loader.js</span>"<br>
&nbsp;&nbsp;data-chatbot-id="<span class="highlight">${chatbotId}</span>"<br>
&nbsp;&nbsp;data-lazy="true"<br>
&gt;&lt;/script&gt;<br><br>

&lt;!-- JavaScript API --&gt;<br>
ConvoAI('open');<br>
ConvoAI('sendMessage', 'Hello!');<br>
ConvoAI('identify', { name: 'John', email: 'john@example.com' });<br>
ConvoAI('on', 'message', (msg) =&gt; console.log(msg));
      </code>
    </div>
  </div>

  <!-- The actual widget -->
  ${scriptTag}

  <script>
    // Demo: Listen to widget events
    setTimeout(() => {
      if (window.ConvoAI) {
        ConvoAI('on', 'open', () => console.log('Widget opened'));
        ConvoAI('on', 'close', () => console.log('Widget closed'));
        ConvoAI('on', 'message', (data) => console.log('Message:', data));
      }
    }, 1000);
  </script>
</body>
</html>
  `);
});

export default router;
