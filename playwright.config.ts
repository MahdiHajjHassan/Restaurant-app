import { defineConfig, devices } from "@playwright/test";
import { PLATFORM, PLATFORM_DOMAIN, PORT } from "./tests/e2e/support/urls";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A stray .only would silently shrink the suite that guards production.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: PLATFORM,
    trace: "on-first-retry",
  },

  /*
   * Every project runs every spec, including the admin ones -- the admin is
   * used standing in a kitchen, on a phone, so mobile coverage of it is the
   * point rather than a bonus.
   *
   * Two projects means two concurrent runs of the same file, which no amount of
   * `mode: "serial"` can serialise: that setting orders tests within a project.
   * The writing specs therefore isolate themselves by DATA, giving each project
   * its own tenant. See tests/e2e/support/sandbox.ts.
   */
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
    command: process.env.CI
      ? `npm run build && npx next start -p ${PORT}`
      : `npx next dev -p ${PORT}`,
    url: PLATFORM,
    // The app resolves the admin host as app.<PLATFORM_DOMAIN>, so it has to
    // agree with the port the suite is actually on.
    env: { PLATFORM_DOMAIN },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
