import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.join(__dirname, "../dist/widget");

async function build() {
  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Build the widget
  await esbuild.build({
    entryPoints: [path.join(__dirname, "chatbot-widget.ts")],
    bundle: true,
    minify: true,
    sourcemap: false,
    target: ["es2018"],
    format: "iife",
    outfile: path.join(outDir, "widget.js"),
  });

  console.log("Widget built successfully!");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
