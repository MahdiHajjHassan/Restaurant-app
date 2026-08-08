import { type Page } from "@playwright/test";
import { expect, test, type Sandbox } from "./support/sandbox";
import { ADMIN } from "./support/urls";

/**
 * Admin console.
 *
 * Self-provisioning: the `sandbox` fixture creates a restaurant, an owner and a
 * rival restaurant for THIS Playwright project before the first test runs, and
 * rebuilds their menu and hours each time. Nothing here reads or writes the
 * seeded demo tenants, and no `scripts/create-admin.ts` step is needed.
 */
/*
 * Serial, deliberately -- and that covers only half the problem.
 *
 * These tests share one restaurant: they edit the same dishes and the same
 * hours, so within a project they must not interleave. `mode: "serial"` does
 * exactly that and no more. It cannot serialise across projects, because
 * `chromium` and `mobile` are two independent runs of this file that execute
 * concurrently whenever there is more than one worker. Isolation across
 * projects comes from the sandbox fixture giving each its own tenant; see
 * tests/e2e/support/sandbox.ts.
 */
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, email: string, password: string) {
  // Drop any existing session first: the login page redirects an
  // already-signed-in visitor away, so its fields would never appear.
  await page.context().clearCookies();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs the sandbox owner in and waits for their tenant admin to load. */
async function signInAsOwner(page: Page, sandbox: Sandbox) {
  await signIn(page, sandbox.owner, sandbox.password);
  await page.waitForURL(new RegExp(`/${sandbox.id}$`), { timeout: 15_000 });
}

/** The form's own error, not the dev overlay's live region. */
const formAlert = (page: Page) => page.locator("form").getByRole("alert");

/**
 * Resolves when the server has acknowledged a Server Action on this tenant.
 *
 * The availability toggle flips optimistically, so asserting on `aria-checked`
 * proves only what the browser drew -- the write may still be in flight.
 * Reloading at that moment races the action: the fresh render is served on a
 * different connection and can read the row before the action's transaction
 * commits, so the page comes back showing the old value while the database is
 * on its way to the new one. Waiting on the action's own response is the
 * barrier; `networkidle` only approximates it.
 *
 * Must be called BEFORE the click, or the response can arrive unobserved.
 */
function actionAcknowledged(page: Page, tenantId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(tenantId),
  );
}

test.describe("access control", () => {
  test("sends a signed-out visitor to the login page", async ({ page }) => {
    await page.goto(ADMIN);
    await expect(page).toHaveURL(`${ADMIN}/login`);
  });

  test("refuses a wrong password without revealing whether the email exists", async ({
    page,
    sandbox,
  }) => {
    await signIn(page, sandbox.owner, "not-the-password");

    await expect(formAlert(page)).toContainText("do not match");

    // Identical wording for an address that has no account at all, so this
    // form cannot be used to enumerate customers.
    await signIn(page, sandbox.unknownEmail, "whatever");
    await expect(formAlert(page)).toContainText("do not match");
  });

  test("signs a real owner in", async ({ page, sandbox }) => {
    await signIn(page, sandbox.owner, sandbox.password);

    await expect(page.getByText(sandbox.name)).toBeVisible();
    await expect(page.getByText("Hummus")).toBeVisible();
  });

  test("signs out and invalidates the session", async ({ page, sandbox }) => {
    await signIn(page, sandbox.owner, sandbox.password);
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(`${ADMIN}/login`);

    // Going back must not restore access from a cached page.
    await page.goto(ADMIN);
    await expect(page).toHaveURL(`${ADMIN}/login`);
  });

  test("keeps one restaurant's owner out of another's admin", async ({
    page,
    sandbox,
  }) => {
    // The single most important authorization check in the product: being
    // signed in is not the same as being entitled to THIS restaurant.
    await signInAsOwner(page, sandbox);
    await page.goto(`${ADMIN}/${sandbox.rival.id}`);

    // Redirected away, and none of the rival's menu is visible.
    await expect(page.getByText(sandbox.rival.dish)).toHaveCount(0);
    expect(page.url()).not.toContain(sandbox.rival.id);
  });

  test("is never indexed by search engines", async ({ page }) => {
    await page.goto(`${ADMIN}/login`);

    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
  });
});

test.describe("menu management", () => {
  test("sold-out toggle reaches the public site", async ({ page, sandbox }) => {
    // The whole product in one test: an owner taps once in the admin, and a
    // customer looking at the site sees the dish crossed off.
    await signInAsOwner(page, sandbox);
    await page.waitForLoadState("networkidle");

    const toggle = page.getByRole("switch", { name: "Hummus available" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    const soldOut = actionAcknowledged(page, sandbox.id);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await soldOut;

    // Reload the admin first: the optimistic flip above proves only what the
    // browser drew. Coming back to a freshly rendered page proves the change
    // actually reached the database.
    await page.goto(`${ADMIN}/${sandbox.id}`);
    await expect(
      page.getByRole("switch", { name: "Hummus available" }),
    ).toHaveAttribute("aria-checked", "false");

    await page.goto(sandbox.site);
    await expect(
      page.getByRole("heading", { name: "Hummus" }),
    ).toHaveCSS("text-decoration-line", "line-through");

    // Put it back, so the suite can run twice. The networkidle wait is load
    // bearing: a click before React hydrates hits a button with no handler
    // attached and does nothing at all -- which is exactly what a real owner
    // experiences tapping too early on a slow connection.
    await page.goto(`${ADMIN}/${sandbox.id}`, { waitUntil: "networkidle" });
    const restore = page.getByRole("switch", { name: "Hummus available" });
    const restored = actionAcknowledged(page, sandbox.id);
    await restore.click();
    await expect(restore).toHaveAttribute("aria-checked", "true");
    await restored;

    await page.goto(`${ADMIN}/${sandbox.id}`);
    await expect(
      page.getByRole("switch", { name: "Hummus available" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("edits a price and shows it on the site", async ({ page, sandbox }) => {
    await signIn(page, sandbox.owner, sandbox.password);
    await page.getByRole("link", { name: /Fattoush/ }).click();

    await page.getByLabel("Price (USD)").fill("9.25");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");

    await page.goto(sandbox.site);
    await expect(page.getByText("$9.25")).toBeVisible();

    // Restore.
    await page.goto(ADMIN);
    await page.getByRole("link", { name: /Fattoush/ }).click();
    await page.getByLabel("Price (USD)").fill("8");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
  });

  test("rejects a dish with no English name", async ({ page, sandbox }) => {
    await signIn(page, sandbox.owner, sandbox.password);
    // A dish no other test touches, so a failure here is about validation.
    await page.getByRole("link", { name: /Chicken Taouk/ }).click();

    await page.getByLabel("Name (English)").fill("");
    // The browser's own required-field validation should block submission.
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByLabel("Name (English)")).toBeFocused();
  });
});

test.describe("hours editor", () => {
  test("saves a split shift that crosses midnight", async ({
    page,
    sandbox,
  }) => {
    await signInAsOwner(page, sandbox);
    await page.goto(`${ADMIN}/${sandbox.id}/hours`);

    await page.getByLabel("Sunday opens", { exact: true }).fill("18:00");
    await page.getByLabel("Sunday closes", { exact: true }).fill("01:00");
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");

    // Assert on the Sunday row specifically. Friday already runs 18:00–01:00
    // in the sandbox, so a bare text match would find two elements and prove
    // nothing about the row that was just edited.
    await page.goto(sandbox.site);
    const sunday = page.locator("dl div").filter({ hasText: "Sunday" });
    await expect(sunday).toContainText("18:00–01:00");

    // Restore Sunday to closed so the suite can run repeatedly.
    await page.goto(`${ADMIN}/${sandbox.id}/hours`);
    await page.getByLabel("Sunday opens", { exact: true }).fill("");
    await page.getByLabel("Sunday closes", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
  });

  test("refuses identical opening and closing times", async ({
    page,
    sandbox,
  }) => {
    // closesAt <= opensAt means "crosses midnight", so 11:00-11:00 would read
    // as open for a full 24 hours -- never what an owner meant.
    await signInAsOwner(page, sandbox);
    await page.goto(`${ADMIN}/${sandbox.id}/hours`);

    await page.getByLabel("Tuesday opens", { exact: true }).fill("11:00");
    await page.getByLabel("Tuesday closes", { exact: true }).fill("11:00");
    await page.getByRole("button", { name: "Save hours" }).click();

    await expect(formAlert(page)).toContainText("cannot be the same");
  });
});
