import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the "@/*" paths from tsconfig.json natively — no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Playwright owns everything under tests/e2e.
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    setupFiles: ["tests/setup.ts"],
  },
});
