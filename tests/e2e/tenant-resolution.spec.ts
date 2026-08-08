import { expect, test } from "@playwright/test";
import { PLATFORM, site as origin } from "./support/urls";

/**
 * Host-based tenant resolution, end to end.
 *
 * Chromium resolves any *.localhost name to the loopback address, so these hit
 * the real middleware with a real Host header rather than simulating one.
 *
 * Requires the seed: scripts/db/seed.sql. Read-only, like menu.spec.ts.
 */

const site = (host: string) => `${origin(host)}/`;

test.describe("tenant resolution", () => {
  test("serves a tenant by its verified hostname", async ({ page }) => {
    await page.goto(site("alpha-grill.localhost"));

    await expect(page.getByRole("heading", { name: "Alpha Grill" })).toBeVisible();
    await expect(page.getByText("Hummus")).toBeVisible();
  });

  test("serves a different tenant on a different hostname", async ({ page }) => {
    await page.goto(site("beta-bistro.localhost"));

    await expect(page.getByRole("heading", { name: "Beta Bistro" })).toBeVisible();
    await expect(page.getByText("Manakish Zaatar")).toBeVisible();
    // Alpha Grill's dishes must not appear here. Same route, same code, two
    // restaurants -- this is the whole product working or not.
    await expect(page.getByText("Hummus")).toHaveCount(0);
  });

  test("formats each tenant's prices in its own currency", async ({ page }) => {
    // Beta Bistro is priced in LBP, which has no minor unit. Rendering it as
    // 3,500.00 instead of 350,000 would be wrong by two orders of magnitude
    // and plausible enough to ship unnoticed.
    await page.goto(site("beta-bistro.localhost"));

    const body = await page.locator("body").innerText();
    expect(body).toContain("75,000");
    expect(body).not.toContain("750.00");
  });

  test("keeps the visitor's URL clean — rewrite, not redirect", async ({
    page,
  }) => {
    await page.goto(site("alpha-grill.localhost"));

    // The internal /_sites/<host> path must never leak into the address bar.
    expect(page.url()).toBe(site("alpha-grill.localhost"));
    expect(page.url()).not.toContain("_sites");
  });

  test("explains itself when a tenant is suspended, rather than 404ing", async ({
    page,
  }) => {
    const response = await page.goto(site("gamma-cafe.localhost"));

    expect(response?.status()).toBe(200);
    await expect(page.getByText(/temporarily unavailable/i)).toBeVisible();
  });

  test("refuses to serve an unverified domain", async ({ page }) => {
    // Anyone can point DNS at the platform. Without the verification check they
    // could serve someone else's restaurant under a lookalike domain.
    const response = await page.goto(site("unverified.localhost"));

    expect(response?.status()).toBe(404);
  });

  test("404s an unknown hostname", async ({ page }) => {
    const response = await page.goto(site("nobody-here.localhost"));

    expect(response?.status()).toBe(404);
  });

  test("refuses direct access to the internal /sites path", async ({ page }) => {
    // The rewrite target has to be a publicly nameable segment, so it must not
    // be addressable directly -- otherwise any visitor could load any tenant by
    // path, sidestepping hostname verification entirely.
    const response = await page.goto(
      `${PLATFORM}/sites/alpha-grill.localhost`,
    );

    expect(response?.status()).toBe(404);
  });
});
