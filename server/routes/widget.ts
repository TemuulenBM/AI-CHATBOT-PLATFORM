import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as esbuild from "esbuild";

const router = Router();

// Cache the built widget
let widgetCache: string | null = null;
let widgetLastBuild: number = 0;
const CACHE_TTL = 60 * 1000; // 1 minute in dev

async function getWidgetScript(): Promise<string> {
  const now = Date.now();

  // Check cache
  if (widgetCache && now - widgetLastBuild < CACHE_TTL) {
    return widgetCache;
  }

  // Try to read pre-built widget
  const prebuiltPath = path.join(process.cwd(), "dist/widget/widget.js");
  if (fs.existsSync(prebuiltPath)) {
    widgetCache = fs.readFileSync(prebuiltPath, "utf-8");
    widgetLastBuild = now;
    return widgetCache;
  }

  // Build on-the-fly in development
  const widgetSourcePath = path.join(process.cwd(), "widget/chatbot-widget.ts");
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

    widgetCache = result.outputFiles[0].text;
    widgetLastBuild = now;
    return widgetCache;
  }

  throw new Error("Widget source not found");
}

// GET /widget.js - Serve the widget script
router.get("/widget.js", async (_req: Request, res: Response) => {
  try {
    const script = await getWidgetScript();

    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "public, max-age=3600"); // 1 hour cache
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(script);
  } catch (error) {
    console.error("Failed to serve widget:", error);
    res.status(500).send("// Widget failed to load");
  }
});

// GET /widget/demo - Demo page to test the widget
router.get("/widget/demo", (req: Request, res: Response) => {
  const chatbotId = req.query.id || "demo-chatbot-id";
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  res.setHeader("Content-Type", "text/html");
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatAI Widget Demo</title>
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
      max-width: 600px;
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
    .code-block {
      background: rgba(0,0,0,0.3);
      padding: 20px;
      border-radius: 12px;
      text-align: left;
      font-family: monospace;
      font-size: 14px;
      overflow-x: auto;
      margin-top: 2rem;
    }
    .code-block code {
      color: #a5f3fc;
    }
    .highlight {
      color: #fcd34d;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 ChatAI Widget Demo</h1>
    <p>Click the chat button in the bottom-right corner to test the widget!</p>

    <div class="code-block">
      <code>
&lt;!-- Add this to your website --&gt;<br>
&lt;script<br>
&nbsp;&nbsp;src="<span class="highlight">${baseUrl}/widget.js</span>"<br>
&nbsp;&nbsp;data-chatbot-id="<span class="highlight">${chatbotId}</span>"<br>
&gt;&lt;/script&gt;
      </code>
    </div>
  </div>

  <!-- The actual widget -->
  <script src="${baseUrl}/widget.js" data-chatbot-id="${chatbotId}"></script>
</body>
</html>
  `);
});

export default router;
