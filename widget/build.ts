import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.join(__dirname, "../dist/widget");
const srcDir = path.join(__dirname, "src");

interface BuildResult {
  file: string;
  size: number;
  gzipSize: number;
  integrity: string;
}

async function build(): Promise<void> {
  console.log("🔨 Building ConvoAI Widget v2.0...\n");

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const results: BuildResult[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  // Build the full widget
  console.log("📦 Building full widget...");
  const widgetResult = await esbuild.build({
    entryPoints: [path.join(srcDir, "index.ts")],
    bundle: true,
    minify: isProduction,
    sourcemap: !isProduction,
    target: ["es2018"],
    format: "iife",
    outfile: path.join(outDir, "widget.js"),
    metafile: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
    },
  });

  const widgetPath = path.join(outDir, "widget.js");
  const widgetContent = fs.readFileSync(widgetPath, "utf-8");
  const widgetIntegrity = generateIntegrity(widgetContent);

  results.push({
    file: "widget.js",
    size: Buffer.byteLength(widgetContent),
    gzipSize: await getGzipSize(widgetContent),
    integrity: widgetIntegrity,
  });

  // Build the loader (tiny async script)
  console.log("📦 Building loader...");
  await esbuild.build({
    entryPoints: [path.join(srcDir, "loader.ts")],
    bundle: true,
    minify: true,
    sourcemap: false,
    target: ["es2018"],
    format: "iife",
    outfile: path.join(outDir, "loader.js"),
  });

  const loaderPath = path.join(outDir, "loader.js");
  const loaderContent = fs.readFileSync(loaderPath, "utf-8");
  const loaderIntegrity = generateIntegrity(loaderContent);

  results.push({
    file: "loader.js",
    size: Buffer.byteLength(loaderContent),
    gzipSize: await getGzipSize(loaderContent),
    integrity: loaderIntegrity,
  });

  // Generate integrity manifest
  const manifest = {
    version: "2.0.0",
    buildTime: new Date().toISOString(),
    files: results.reduce(
      (acc, r) => {
        acc[r.file] = {
          size: r.size,
          gzipSize: r.gzipSize,
          integrity: r.integrity,
        };
        return acc;
      },
      {} as Record<string, { size: number; gzipSize: number; integrity: string }>
    ),
  };

  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // Print results
  console.log("\n✅ Build complete!\n");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│ File           │ Size      │ Gzipped   │ Integrity         │");
  console.log("├─────────────────────────────────────────────────────────────┤");

  for (const result of results) {
    const file = result.file.padEnd(14);
    const size = formatBytes(result.size).padEnd(9);
    const gzip = formatBytes(result.gzipSize).padEnd(9);
    const integrity = result.integrity.substring(0, 17) + "...";
    console.log(`│ ${file} │ ${size} │ ${gzip} │ ${integrity} │`);
  }

  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log(`\n📁 Output: ${outDir}`);

  // Print bundle analysis if in verbose mode
  if (process.argv.includes("--analyze") && widgetResult.metafile) {
    console.log("\n📊 Bundle Analysis:");
    const text = await esbuild.analyzeMetafile(widgetResult.metafile);
    console.log(text);
  }
}

function generateIntegrity(content: string): string {
  const hash = crypto.createHash("sha384").update(content).digest("base64");
  return `sha384-${hash}`;
}

async function getGzipSize(content: string): Promise<number> {
  const { gzipSync } = await import("zlib");
  return gzipSync(content).length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
