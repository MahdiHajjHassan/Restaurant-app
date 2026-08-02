import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A stray .only would silently shrink the suite that guards production.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Restaurant menus are read on phones, on bad connections. Mobile is the
      // primary target, not an afterthought.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    // CI exercises the production build, because that is what customers get:
    // dev-server behaviour differs on caching, error handling, and bundling,
    // and a bug that only appears in production is the expensive kind.
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
