import { type Page } from "@playwright/test";
import { expect, test, type EmptySandbox } from "./support/sandbox";
import { ADMIN } from "./support/urls";

/**
 * Onboarding, as a test rather than as a hope.
 *
 * The product's central claim is that a restaurant goes live the same day, with
 * its menu typed in during the sale. That claim is only true if an owner can
 * start from a tenant with nothing in it and end with a menu on their site --
 * so this walks exactly that path, on a tenant that is genuinely empty.
 *
 * Its tenant is provisioned per Playwright project and per parallel slot by the
 * `emptySandbox` fixture, and wiped clean each run. Isolation is by data, never
 * by ordering.
 */
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, sandbox: EmptySandbox) {
  // Drop any existing session first: the login page redirects an
  // already-signed-in visitor away, so its fields would never appear.
  await page.context().clearCookies();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(sandbox.owner);
  await page.getByLabel("Password").fill(sandbox.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for login to actually leave /login before going on: the redirect is a
  // real request, and racing it lands on a page about to be replaced.
  await page.waitForURL(new RegExp(`/${sandbox.id}$`), { timeout: 15_000 });
  // A click before React hydrates hits a button with no handler attached and
  // does nothing at all -- which is what a real owner gets tapping too early.
  await page.waitForLoadState("networkidle");
}

/**
 * Adds one dish the way the design says it should be added: type, type, Enter.
 *
 * Enter rather than clicking Add, deliberately. Implicit form submission is
 * the entire premise of quick-add -- ninety dishes without the hand leaving
 * the keyboard -- so a test that clicked the button would pass while the
 * feature that matters was broken.
 */
async function quickAdd(
  page: Page,
  section: string,
  name: string,
  price: string,
) {
  // `exact` matters: getByLabel substring-matches, and the price field's label
  // ("Price for new dish in Mezze (USD)") contains the name field's.
  await page.getByLabel(`New dish in ${section}`, { exact: true }).fill(name);
  const priceField = page.getByLabel(
    new RegExp(`^Price for new dish in ${section}`),
  );
  await priceField.fill(price);
  await priceField.press("Enter");

  // Wait for the dish to appear in the list, not for the inputs to clear.
  // Clearing happens the moment the action returns; the row only renders once
  // the server has the dish. Waiting on the weaker signal races the next step.
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
}

test("builds a menu from nothing and puts it on the site", async ({
  page,
  emptySandbox,
}) => {
  await signIn(page, emptySandbox);

  // Nothing yet -- and the page says what to do rather than rendering an empty
  // shell.
  await expect(
    page.getByRole("heading", { name: /build your menu/i }),
  ).toBeVisible();

  // 1. A section, in both languages.
  await page.getByLabel("New section").fill("Mezze");
  await page.getByLabel("Arabic name (optional)").fill("مقبلات");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByRole("heading", { name: /Mezze/ })).toBeVisible();

  // 2. Three dishes, without leaving the page once.
  await quickAdd(page, "Mezze", "Hummus", "6.50");
  await quickAdd(page, "Mezze", "Fattoush", "8");
  await quickAdd(page, "Mezze", "Tabbouleh", "7.25");

  // Focus stays where the next dish gets typed -- the whole reason quick-add
  // exists rather than a form page per dish.
  await expect(
    page.getByLabel("New dish in Mezze", { exact: true }),
  ).toBeFocused();

  // 3. Reorder: Tabbouleh above Fattoush.
  await page.getByRole("button", { name: "Move Tabbouleh up" }).click();

  // 4. Delete one, with a confirmation that names it.
  await page.getByRole("button", { name: "Delete Fattoush" }).click();
  await expect(page.getByText("Delete Fattoush?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("link", { name: /Fattoush/ })).toHaveCount(0);

  // Reload before asserting the order: everything above proves what the browser
  // drew, and a fresh render is what proves it reached the database.
  await page.goto(`${ADMIN}/${emptySandbox.id}`);
  await expect(page.locator("main ul li a span:first-child")).toHaveText([
    "Hummus",
    "Tabbouleh",
  ]);

  // 5. The customer's view. This is the claim: typed during the sale, live the
  // same day.
  await page.goto(emptySandbox.site);
  await expect(page.getByRole("heading", { name: "Mezze" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hummus" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tabbouleh" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fattoush" })).toHaveCount(0);
  await expect(page.getByText("$6.50")).toBeVisible();
});

test("refuses a dish with no price", async ({ page, emptySandbox }) => {
  await signIn(page, emptySandbox);

  // Creates its own section rather than assuming the previous test's: with
  // fullyParallel these may land on different workers, and therefore on
  // different tenants.
  await page.getByLabel("New section").fill("Drinks");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByRole("heading", { name: /Drinks/ })).toBeVisible();

  // A dish with no price would be a free dish. The browser's own required-field
  // validation blocks it before a request is ever made.
  await page.getByLabel("New dish in Drinks", { exact: true }).fill("Water");
  await page.getByRole("button", { name: "Add dish to Drinks" }).click();
  await expect(page.getByLabel(/^Price for new dish in Drinks/)).toBeFocused();

  // And it is still not on the site.
  await page.goto(emptySandbox.site);
  await expect(page.getByRole("heading", { name: "Water" })).toHaveCount(0);
});
