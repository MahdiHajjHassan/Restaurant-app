import { expect, test, type Page } from "@playwright/test";

/**
 * Admin console.
 *
 * Requires the seed plus the demo admins:
 *   node scripts/create-admin.ts owner@alpha-grill.test <password> alpha-grill
 *   node scripts/create-admin.ts owner@beta-bistro.test <password> beta-bistro
 */
/*
 * Serial, deliberately.
 *
 * These tests mutate one shared database: several of them edit the same
 * restaurant's dishes and hours. Run in parallel they interleave and fail on
 * each other's writes, which looks like a product bug and is not one. Making
 * them independent would mean provisioning a tenant per test, which is more
 * machinery than this suite is worth.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = "http://app.localhost:3000";
const ALPHA_SITE = "http://alpha-grill.localhost:3000";

const ALPHA_OWNER = "owner@alpha-grill.test";
const BETA_OWNER = "owner@beta-bistro.test";
const DEMO_PASSWORD = "demo-password-123";

async function signIn(page: Page, email: string, password = DEMO_PASSWORD) {
  // Drop any existing session first: the login page redirects an
  // already-signed-in visitor away, so its fields would never appear.
  await page.context().clearCookies();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits for the tenant admin, returning its tenant id. */
async function signInToTenant(page: Page, email: string): Promise<string> {
  await signIn(page, email);
  await page.waitForURL(/\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url().split("/").pop()!;
}

/** The form's own error, not the dev overlay's live region. */
const formAlert = (page: Page) => page.locator("form").getByRole("alert");

test.describe("access control", () => {
  test("sends a signed-out visitor to the login page", async ({ page }) => {
    await page.goto(ADMIN);
    await expect(page).toHaveURL(`${ADMIN}/login`);
  });

  test("refuses a wrong password without revealing whether the email exists", async ({
    page,
  }) => {
    await signIn(page, ALPHA_OWNER, "not-the-password");

    await expect(formAlert(page)).toContainText("do not match");

    // Identical wording for an address that has no account at all, so this
    // form cannot be used to enumerate customers.
    await signIn(page, "nobody@nowhere.test", "whatever");
    await expect(formAlert(page)).toContainText("do not match");
  });

  test("signs a real owner in", async ({ page }) => {
    await signIn(page, ALPHA_OWNER);

    await expect(page.getByText("Alpha Grill")).toBeVisible();
    await expect(page.getByText("Hummus")).toBeVisible();
  });

  test("signs out and invalidates the session", async ({ page }) => {
    await signIn(page, ALPHA_OWNER);
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(`${ADMIN}/login`);

    // Going back must not restore access from a cached page.
    await page.goto(ADMIN);
    await expect(page).toHaveURL(`${ADMIN}/login`);
  });

  test("keeps one restaurant's owner out of another's admin", async ({
    page,
  }) => {
    // The single most important authorization check in the product: being
    // signed in is not the same as being entitled to THIS restaurant.
    const betaTenantId = await signInToTenant(page, BETA_OWNER);

    await signInToTenant(page, ALPHA_OWNER);
    await page.goto(`${ADMIN}/${betaTenantId}`);

    // Redirected away, and none of Beta Bistro's menu is visible.
    await expect(page.getByText("Manakish Zaatar")).toHaveCount(0);
    expect(page.url()).not.toContain(betaTenantId);
  });

  test("is never indexed by search engines", async ({ page }) => {
    await page.goto(`${ADMIN}/login`);

    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
  });
});

test.describe("menu management", () => {
  test("sold-out toggle reaches the public site", async ({ page }) => {
    // The whole product in one test: an owner taps once in the admin, and a
    // customer looking at the site sees the dish crossed off.
    const tenantId = await signInToTenant(page, ALPHA_OWNER);
    await page.waitForLoadState("networkidle");

    const toggle = page.getByRole("switch", { name: "Hummus available" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // Reload the admin first: the optimistic flip above proves only what the
    // browser drew. Coming back to a freshly rendered page proves the change
    // actually reached the database.
    await page.goto(`${ADMIN}/${tenantId}`);
    await expect(
      page.getByRole("switch", { name: "Hummus available" }),
    ).toHaveAttribute("aria-checked", "false");

    await page.goto(ALPHA_SITE);
    await expect(
      page.getByRole("heading", { name: "Hummus" }),
    ).toHaveCSS("text-decoration-line", "line-through");

    // Put it back, so the suite can run twice. The networkidle wait is load
    // bearing: a click before React hydrates hits a button with no handler
    // attached and does nothing at all -- which is exactly what a real owner
    // experiences tapping too early on a slow connection.
    await page.goto(`${ADMIN}/${tenantId}`, { waitUntil: "networkidle" });
    const restore = page.getByRole("switch", { name: "Hummus available" });
    await restore.click();
    await expect(restore).toHaveAttribute("aria-checked", "true");
    await page.waitForLoadState("networkidle");

    await page.goto(`${ADMIN}/${tenantId}`);
    await expect(
      page.getByRole("switch", { name: "Hummus available" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("edits a price and shows it on the site", async ({ page }) => {
    await signIn(page, ALPHA_OWNER);
    await page.getByRole("link", { name: /Fattoush/ }).click();

    await page.getByLabel("Price (USD)").fill("9.25");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");

    await page.goto(ALPHA_SITE);
    await expect(page.getByText("$9.25")).toBeVisible();

    // Restore.
    await page.goto(ADMIN);
    await page.getByRole("link", { name: /Fattoush/ }).click();
    await page.getByLabel("Price (USD)").fill("8");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
  });

  test("rejects a dish with no English name", async ({ page }) => {
    await signIn(page, ALPHA_OWNER);
    // A dish no other test touches, so a failure here is about validation.
    await page.getByRole("link", { name: /Chicken Taouk/ }).click();

    await page.getByLabel("Name (English)").fill("");
    // The browser's own required-field validation should block submission.
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByLabel("Name (English)")).toBeFocused();
  });
});

test.describe("hours editor", () => {
  test("saves a split shift that crosses midnight", async ({ page }) => {
    const tenantId = await signInToTenant(page, ALPHA_OWNER);
    await page.goto(`${ADMIN}/${tenantId}/hours`);

    await page.getByLabel("Sunday opens", { exact: true }).fill("18:00");
    await page.getByLabel("Sunday closes", { exact: true }).fill("01:00");
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");

    // Assert on the Sunday row specifically. Friday already runs 18:00–01:00
    // in the seed, so a bare text match would find two elements and prove
    // nothing about the row that was just edited.
    await page.goto(ALPHA_SITE);
    const sunday = page.locator("dl div").filter({ hasText: "Sunday" });
    await expect(sunday).toContainText("18:00–01:00");

    // Restore Sunday to closed so the suite can run repeatedly.
    await page.goto(`${ADMIN}/${tenantId}/hours`);
    await page.getByLabel("Sunday opens", { exact: true }).fill("");
    await page.getByLabel("Sunday closes", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
  });

  test("refuses identical opening and closing times", async ({ page }) => {
    // closesAt <= opensAt means "crosses midnight", so 11:00-11:00 would read
    // as open for a full 24 hours -- never what an owner meant.
    const tenantId = await signInToTenant(page, ALPHA_OWNER);
    await page.goto(`${ADMIN}/${tenantId}/hours`);

    await page.getByLabel("Tuesday opens", { exact: true }).fill("11:00");
    await page.getByLabel("Tuesday closes", { exact: true }).fill("11:00");
    await page.getByRole("button", { name: "Save hours" }).click();

    await expect(formAlert(page)).toContainText("cannot be the same");
  });
});
