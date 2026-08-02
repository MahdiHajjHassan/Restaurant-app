import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A stray .only would silently shrink the suite that guards production.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /*
   * One worker, everywhere.
   *
   * These specs mutate ONE shared database: they toggle the same dish, change
   * the same tenant's theme, and upload to the same restaurant.
   * `test.describe.configure({ mode: "serial" })` only orders tests within a
   * project, so the chromium and mobile projects still collided -- producing
   * failures that read as product bugs and are not.
   *
   * The cost is roughly a minute. The alternative, a tenant fixture per
   * project, is the right long-term fix and a much larger change; until then a
   * suite that passes is worth more than a suite that finishes sooner.
   */
  workers: 1,
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
