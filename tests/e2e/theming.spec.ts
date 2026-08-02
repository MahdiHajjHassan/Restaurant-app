import { expect, test } from "@playwright/test";

/**
 * Per-tenant theming.
 *
 * Requires the seed: Alpha Grill carries an explicit crimson/modern/grid theme,
 * Beta Bistro deliberately carries no theme row at all.
 *
 * Chromium maps any *.localhost to loopback, which is why these hostnames work
 * with no hosts-file editing. Node and Playwright's `request` fixture do NOT --
 * they use the OS resolver -- so this suite drives the browser throughout.
 */
const ALPHA = "http://alpha-grill.localhost:3000";
const BETA = "http://beta-bistro.localhost:3000";

/** The element carrying the tenant's theme tokens. */
const themeWrapper = "[style*='--color-accent']";

test.describe("per-tenant theming", () => {
  /*
   * The whole product claim in one assertion: two restaurants, one codebase,
   * visibly different sites. If this ever passes with both tenants equal, the
   * theming layer has silently stopped applying.
   */
  test("two tenants render different palettes", async ({ page }) => {
    await page.goto(ALPHA);
    const alphaAccent = await page
      .locator(themeWrapper)
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--color-accent"));

    await page.goto(BETA);
    const betaAccent = await page
      .locator(themeWrapper)
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--color-accent"));

    expect(alphaAccent.trim()).toBe("#c8102e");
    expect(betaAccent.trim()).toBe("#3f5d3a");
    expect(alphaAccent).not.toBe(betaAccent);
  });

  /*
   * A tenant with no theme_settings row must fall back to the platform default,
   * not fail. Theme is optional configuration and must never take a
   * restaurant's menu offline.
   */
  test("a tenant with no theme row still serves its menu", async ({ page }) => {
    await page.goto(BETA);

    await expect(page.getByRole("heading", { name: "Beta Bistro" })).toBeVisible();
    await expect(page.locator("ul[data-preset]").first()).toHaveAttribute(
      "data-preset",
      "list",
    );
  });

  test("the themed font actually reaches the heading", async ({ page }) => {
    await page.goto(ALPHA);

    // Regression guard: overriding the inner --font-display-family instead of
    // --font-display leaves headings silently rendering in the platform
    // default, because globals.css bakes that substitution at :root.
    const heading = page.getByRole("heading", { name: "Alpha Grill" });
    await expect(heading).toHaveCSS("font-family", /Cairo/);

    await page.goto(BETA);
    await expect(
      page.getByRole("heading", { name: "Beta Bistro" }),
    ).toHaveCSS("font-family", /Amiri/);
  });

  test("only the themed display face is downloaded", async ({ page }) => {
    await page.goto(ALPHA);
    // Give non-preloaded faces a chance to be requested before counting.
    await page.waitForLoadState("networkidle");

    const families = await page.evaluate(() => [
      ...new Set(
        [...document.fonts]
          .filter((f) => f.status === "loaded")
          .map((f) => f.family),
      ),
    ]);

    /*
     * next/font preloads by default, which fetched all four declared families
     * regardless of which one the theme used -- 21 woff2 files on a single
     * load, against a <500KB budget for the whole page. preload:false on the
     * display faces is what keeps this to the one family in use.
     */
    expect(families).toContain("Cairo");
    expect(families).not.toContain("Amiri");
    expect(families).not.toContain("Tajawal");
  });
});

test.describe("layout presets", () => {
  test("grid lays dishes out in columns", async ({ page }) => {
    await page.goto(ALPHA);

    const list = page.locator("ul[data-preset]").first();
    await expect(list).toHaveAttribute("data-preset", "grid");

    // Two dishes on the same row means a real grid, not a stacked list.
    const columnCount = await list.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
    expect(columnCount).toBeGreaterThanOrEqual(2);
  });

  test("list keeps the leader rule", async ({ page }) => {
    await page.goto(BETA);

    // The typographic signature of a printed menu: the dotted line carrying
    // the eye from dish to price. It is the reason the list preset exists.
    const leader = page.locator(".leader").first();
    await expect(leader).toBeAttached();
    const width = await leader.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(0);
  });

  test("grid mirrors under RTL", async ({ page }) => {
    await page.goto(`${ALPHA}/ar`);

    const items = page.locator("li[data-item]");
    const firstLeft = await items
      .nth(0)
      .evaluate((el) => el.getBoundingClientRect().left);
    const secondLeft = await items
      .nth(1)
      .evaluate((el) => el.getBoundingClientRect().left);

    // In Arabic the first dish sits to the RIGHT of the second.
    expect(firstLeft).toBeGreaterThan(secondLeft);
  });

  test("prices stay in Latin digits under Arabic", async ({ page }) => {
    await page.goto(`${ALPHA}/ar`);

    // The regional menu convention, and it keeps admin and site consistent.
    // Arabic-Indic digits here would be a locale-formatting regression.
    const price = await page.locator(".price").first().textContent();
    expect(price).toMatch(/[0-9]/);
    expect(price).not.toMatch(/[٠-٩]/);
  });

  test("search still filters in the grid preset", async ({ page }) => {
    await page.goto(ALPHA);

    await page.getByRole("searchbox").fill("zzzznomatch");
    await expect(page.locator("#menu-empty")).toBeVisible();

    await page.getByRole("searchbox").fill("hummus");
    await expect(page.getByText("Hummus")).toBeVisible();
  });
});
