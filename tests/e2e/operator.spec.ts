import { type Page } from "@playwright/test";
import {
  dropRestaurant,
  expect,
  OPERATOR_EMAIL,
  SANDBOX_PASSWORD,
  test,
} from "./support/sandbox";
import { ADMIN, PORT } from "./support/urls";

/**
 * The sale, start to finish.
 *
 * The operator creates a restaurant in a browser, the owner signs in with the
 * password just set, and a customer reads the menu on its own address. That is
 * the onboarding claim this whole phase exists to make true, so it exists as a
 * test rather than as a hope.
 *
 * Isolation is by data: the slug carries the Playwright project and parallel
 * slot, and the spec drops what it created -- before as well as after, since a
 * killed run leaves the slug taken and the console would then correctly refuse
 * to create it again.
 */
test.describe.configure({ mode: "serial" });

/**
 * Both tests here walk several routes end to end, and these are the only specs
 * that reach `/operator/*` -- so they pay the dev server's first-compile cost
 * for every one of those routes while the rest of the suite competes for the
 * same server. That is comfortably more than Playwright's default 30s budget
 * for a whole test, and it is a property of dev-mode compilation rather than
 * of the console.
 *
 * The per-wait timeout stays well under the per-test one on purpose: if a
 * single step really is stuck, it should fail pointing at that step rather
 * than as an unattributed whole-test timeout, which is exactly the confusion
 * an equal pair of numbers caused here.
 */
const TEST_BUDGET = 120_000;
const COLD_ROUTE = 30_000;

async function signIn(page: Page, email: string, password: string) {
  // Drop any existing session: the login page redirects an already-signed-in
  // visitor away, so its fields would never appear.
  await page.context().clearCookies();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait to actually leave /login before navigating on: the redirect is a real
  // request, and racing it lands on a page that is about to be replaced.
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: COLD_ROUTE,
  });
}

test("creates a restaurant an owner can sign into and a customer can read", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_BUDGET);

  const slug =
    `e2e-new-${testInfo.project.name}-${testInfo.parallelIndex}`.toLowerCase();
  const ownerEmail = `owner@${slug}.test`;
  const ownerPassword = "brand-new-password-123";

  await dropRestaurant(slug, ownerEmail);

  try {
    await signIn(page, OPERATOR_EMAIL, SANDBOX_PASSWORD);
    await page.goto(`${ADMIN}/operator/new`);

    await page
      .getByLabel("Restaurant name")
      .fill(`E2E New ${testInfo.parallelIndex}`);
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Initial password").fill(ownerPassword);
    await page.getByLabel(/example menu/i).check();
    await page.getByRole("button", { name: "Create restaurant" }).click();

    // Landed on the new restaurant's page, with an address that is verified
    // because the platform issued it to itself.
    //
    // Scoped to the row rather than the page: "Verified" also appears on the
    // control that would unverify it, so a bare text match proves nothing
    // about the address it is supposed to be describing.
    const primaryRow = page
      .locator("li")
      .filter({ hasText: `${slug}.localhost` });
    await expect(primaryRow).toBeVisible({ timeout: COLD_ROUTE });
    await expect(primaryRow).toContainText("Verified");

    // The customer's view, on an address that did not exist a moment ago.
    await page.goto(`http://${slug}.localhost:${PORT}`);
    await expect(page.getByRole("heading", { name: "Hummus" })).toBeVisible();

    // The owner signs in with the password the operator just set and lands on
    // their own menu. This is what replaces scripts/create-admin.ts.
    await signIn(page, ownerEmail, ownerPassword);
    await expect(page.getByText("Hummus")).toBeVisible();

    // ...and cannot reach the console.
    await page.goto(`${ADMIN}/operator`);
    await expect(
      page.getByRole("heading", { name: "Restaurants" }),
    ).toHaveCount(0);
  } finally {
    await dropRestaurant(slug, ownerEmail);
  }
});

test("lets the operator work inside a restaurant, with a way out", async ({
  page,
  sandbox,
}) => {
  test.setTimeout(TEST_BUDGET);

  await signIn(page, OPERATOR_EMAIL, SANDBOX_PASSWORD);

  /*
   * The RIVAL tenant, deliberately -- not this project's sandbox.
   *
   * The sandbox grants the operator a real membership in its own tenant, so
   * entering that one is ordinary access and no impersonation happens at all.
   * The rival has no members by design, which makes it the only place where
   * this feature is actually the thing under test.
   */
  await page.goto(`${ADMIN}/operator/${sandbox.rival.id}`);

  await page.getByRole("button", { name: /^Sign in as / }).click();

  // The banner is the safety feature: the hazard is forgetting you are inside
  // a client's live menu and editing it believing it is the demo.
  await expect(page.getByText(/You are working inside/)).toBeVisible({
    timeout: COLD_ROUTE,
  });
  await expect(page.getByText(sandbox.rival.dish)).toBeVisible();

  // A link, not a button: leaving clears the cookie granting access to this
  // page, so it goes through a redirecting route handler rather than a Server
  // Action that would race its own re-render.
  await page.getByRole("link", { name: "Leave" }).click();
  await page.waitForURL(/\/operator$/, { timeout: COLD_ROUTE });
  await expect(page.getByText(/You are working inside/)).toHaveCount(0);

  // And the impersonation is genuinely over, not merely off screen: the rival
  // admin must refuse them again.
  await page.goto(`${ADMIN}/${sandbox.rival.id}`);
  await expect(page.getByText(sandbox.rival.dish)).toHaveCount(0);
});
