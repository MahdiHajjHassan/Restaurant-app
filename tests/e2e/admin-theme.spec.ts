import { type Page } from "@playwright/test";
import {
  expect,
  OPERATOR_EMAIL,
  SANDBOX_PASSWORD,
  test,
  type Sandbox,
} from "./support/sandbox";
import { ADMIN } from "./support/urls";

/**
 * The theme editor.
 *
 * Self-provisioning: the `sandbox` fixture gives this Playwright project its
 * own restaurant, reset to the platform default theme (paper / classic / list)
 * before the first test runs. Nothing here touches the seeded demo tenants,
 * which theming.spec.ts asserts against read-only and in parallel.
 *
 * The platform-operator account is the one exception -- per-token colour entry
 * is an operator capability, and there is one operator, not one per project.
 * The operator tests still write only to this project's own tenant.
 */
/*
 * Serial within the project: these share one restaurant and one saved theme, so
 * they must not interleave. Across projects, isolation is by data -- see
 * tests/e2e/support/sandbox.ts.
 */
test.describe.configure({ mode: "serial" });


/**
 * Clicks the visual card rather than the input.
 *
 * The radios are sr-only by design -- the swatch is the visible control, and
 * the native input stays in the DOM so the group remains keyboard-navigable and
 * announced. Driving the label is therefore both what a real owner does and a
 * check that the label is genuinely wired to its input.
 */
async function pick(page: Page, field: string, value: string) {
  await page
    .locator(`label:has(input[name="${field}"][value="${value}"])`)
    .click();
  await expect(
    page.locator(`input[name="${field}"][value="${value}"]`),
  ).toBeChecked();
}

async function save(page: Page) {
  await page.getByRole("button", { name: /save look/i }).click();
  await expect(page.getByRole("status")).toBeVisible();
}

/**
 * Sets a React-controlled colour input without typing.
 *
 * `<input type=color>` cannot be driven by keyboard in a headless browser, so
 * the value is written through the native setter and an input event dispatched
 * -- otherwise React never sees the change and the preview does not update.
 */
async function setColour(page: Page, token: string, value: string) {
  await page.evaluate(
    ({ token, value }) => {
      const input = document.querySelector<HTMLInputElement>(
        `input[data-token="${token}"]`,
      );
      if (!input) throw new Error(`No colour input for ${token}`);
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { token, value },
  );
}

async function signIn(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  /*
   * Wait for the session to actually exist before anyone navigates away.
   *
   * The click starts a Server Action; navigating immediately races it, and the
   * next page is then fetched without a session cookie and redirected straight
   * back to /login -- which surfaces as "the control isn't on the page" rather
   * than as an auth failure, and is a slow lesson to learn twice.
   *
   * Leaving /login is the signal rather than a specific destination: an owner
   * with one restaurant lands on it, while the operator holds memberships in
   * several and does not.
   */
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 15_000,
  });
}

/** Signs the sandbox owner in and opens their theme editor. */
async function openTheme(page: Page, sandbox: Sandbox) {
  await signIn(page, sandbox.owner, sandbox.password);
  await page.waitForURL(new RegExp(`/${sandbox.id}$`), { timeout: 15_000 });
  await page.goto(`${ADMIN}/${sandbox.id}/theme`, { waitUntil: "networkidle" });
}

/**
 * The operator has memberships in more than one restaurant, so signing in does
 * not land anywhere in particular -- navigate explicitly.
 */
async function openThemeAsOperator(page: Page, sandbox: Sandbox) {
  await signIn(page, OPERATOR_EMAIL, SANDBOX_PASSWORD);
  await page.goto(`${ADMIN}/${sandbox.id}/theme`, { waitUntil: "networkidle" });
}

/** Returns the tenant palette actually rendered on the public site. */
async function siteToken(page: Page, url: string, token: string) {
  await page.goto(url);
  const value = await page
    .locator("[style*='--color-accent']")
    .first()
    .evaluate(
      (el, name) => getComputedStyle(el).getPropertyValue(name),
      token,
    );
  return value.trim();
}

test.describe("theme editor", () => {
  test("owner changes the palette and the public site follows", async ({
    page,
    sandbox,
  }) => {
    await openTheme(page, sandbox);

    await pick(page, "paletteId", "navy");
    await save(page);

    // Loading the real site rather than trusting what the browser drew: this
    // proves the change reached the database.
    expect(await siteToken(page, sandbox.site, "--color-accent")).toBe(
      "#1c3f6e",
    );
  });

  test("changing the layout preset reaches the public site", async ({
    page,
    sandbox,
  }) => {
    await openTheme(page, sandbox);

    await pick(page, "preset", "grid");
    await save(page);

    await page.goto(sandbox.site);
    await expect(page.locator("ul[data-preset]").first()).toHaveAttribute(
      "data-preset",
      "grid",
    );

    // Back to list, and its typographic signature must come with it.
    await openTheme(page, sandbox);
    await pick(page, "preset", "list");
    await save(page);

    await page.goto(sandbox.site);
    await expect(page.locator(".leader").first()).toBeAttached();
  });

  test("changing the font pairing reaches the public site", async ({
    page,
    sandbox,
  }) => {
    await openTheme(page, sandbox);

    await pick(page, "fontPair", "warm");
    await save(page);

    await page.goto(sandbox.site);
    await expect(page.getByRole("heading", { name: sandbox.name })).toHaveCSS(
      "font-family",
      /Tajawal/,
    );
  });

  test("hides operator-only colour controls from an owner", async ({
    page,
    sandbox,
  }) => {
    await openTheme(page, sandbox);

    await expect(page.getByText("Exact colours")).toHaveCount(0);
    await expect(page.locator("input[type=color]")).toHaveCount(0);
  });

  test("shows a live preview of the candidate theme", async ({
    page,
    sandbox,
  }) => {
    await openTheme(page, sandbox);

    const preview = page.locator("[style*='--color-accent']").last();

    // Selecting a palette must repaint the preview with no round trip -- that
    // is the entire point of previewing before saving.
    await pick(page, "paletteId", "charcoal");
    await expect(preview).toHaveCSS("background-color", "rgb(26, 24, 21)");

    await pick(page, "paletteId", "navy");
    await expect(preview).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });
});

test.describe("operator colour controls", () => {
  test("shows per-token colour entry to a platform operator", async ({
    page,
    sandbox,
  }) => {
    await openThemeAsOperator(page, sandbox);

    await expect(page.getByText("Exact colours")).toBeVisible();
    await expect(page.locator("input[type=color]")).toHaveCount(7);
  });

  /*
   * The verification that actually matters.
   *
   * The form disables its own submit button when contrast fails, but a disabled
   * button is a courtesy, not a boundary -- it can be re-enabled from the
   * console in seconds. This test does exactly that and submits anyway, proving
   * the refusal lives in the Server Action. Without it, "contrast validation
   * blocks unreadable themes" is a claim about CSS rather than about the
   * product.
   */
  test("refuses an unreadable palette even when the button is re-enabled", async ({
    page,
    sandbox,
  }) => {
    await openThemeAsOperator(page, sandbox);

    // Reset to a known palette so the assertion below names a fixed colour.
    await pick(page, "paletteId", "paper");
    await save(page);
    await openThemeAsOperator(page, sandbox);

    // Near-white secondary text on near-white paper: unreadable, and the exact
    // mistake owners make because they never think to touch `muted`.
    await setColour(page, "muted", "#fbfbfb");

    const submit = page.getByRole("button", { name: /save look/i });
    await expect(submit).toBeDisabled();

    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) =>
        /save look/i.test(b.textContent ?? ""),
      );
      if (!button) throw new Error("Save button not found");
      button.disabled = false;
      button.click();
    });

    /*
     * Two alerts are expected, and the distinction is the point: the client's
     * live warning ("hard to read") is advisory, while the Server Action's
     * refusal ("not readable") is the boundary. Only the second proves the save
     * was rejected server-side.
     */
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Those colours are not readable/i }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);

    // And nothing was written: the site keeps the paper palette's muted tone.
    expect(await siteToken(page, sandbox.site, "--color-muted")).toBe("#6e6a5f");
  });

  test("saves a readable operator override and the site follows", async ({
    page,
    sandbox,
  }) => {
    await openThemeAsOperator(page, sandbox);

    await setColour(page, "accent", "#7b1020");
    await save(page);

    expect(await siteToken(page, sandbox.site, "--color-accent")).toBe(
      "#7b1020",
    );
  });

  /*
   * Overrides must stay SPARSE -- only the tokens actually changed.
   *
   * A named <input type=color> posts on every submit, which silently wrote all
   * seven tokens as overrides and froze the tenant on that day's palette. The
   * reset control disappearing is the observable proof that nothing is stored:
   * it only renders when overrides exist.
   */
  test("stores only the tokens the operator actually changed", async ({
    page,
    sandbox,
  }) => {
    await openThemeAsOperator(page, sandbox);

    const reset = page.getByRole("button", {
      name: /reset colours to the palette/i,
    });

    // Changing one colour creates exactly one override.
    await setColour(page, "accent", "#7b1020");
    await expect(reset).toBeVisible();
    await save(page);

    // Clearing it must leave nothing behind, not seven redundant tokens.
    await openThemeAsOperator(page, sandbox);
    await reset.click();
    await save(page);

    await openThemeAsOperator(page, sandbox);
    await expect(reset).toHaveCount(0);
  });
});
