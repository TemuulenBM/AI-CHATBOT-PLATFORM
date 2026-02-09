import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["node_modules", "dist", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["server/**/*.ts"],
      exclude: [
        "server/**/*.test.ts",
        "server/**/*.spec.ts",
        "server/index.ts",
        "server/vite.ts",
        "server/static.ts",
      ],
      thresholds: {
        // Хамгийн бага coverage шаардлага — regression-с хамгаална
        // 40% нь одоогийн байдалд бодитой зорилт; цаашид 60%+ руу ахиулах
        lines: 40,
        functions: 40,
        branches: 30,
        statements: 40,
      },
    },
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
