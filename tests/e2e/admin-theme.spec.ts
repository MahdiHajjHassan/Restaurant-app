import { expect, test, type Page } from "@playwright/test";

/**
 * The theme editor.
 *
 * Requires the seed plus the demo admins:
 *   node scripts/create-admin.ts owner@alpha-grill.test <password> alpha-grill owner
 *   node scripts/create-admin.ts operator@platform.test <password> alpha-grill owner --platform-admin
 */
/*
 * Serial for the same reason as admin.spec.ts: these mutate one shared
 * database, and the tenant's saved theme is global state later assertions
 * depend on.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = "http://app.localhost:3000";
const ALPHA_SITE = "http://alpha-grill.localhost:3000";
const ALPHA_OWNER = "owner@alpha-grill.test";
const OPERATOR = "operator@platform.test";
const DEMO_PASSWORD = "demo-password-123";

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
 * Sets a React-controlled input without typing.
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

async function signIn(page: Page, email: string): Promise<string> {
  await page.context().clearCookies();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url().split("/").pop()!;
}

/** Restores the seeded theme so the suite can run twice. */
async function restoreSeedTheme(page: Page, tenantId: string) {
  await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });

  // Clear any operator colour overrides first. Re-picking an already-selected
  // palette fires no change event, so it cannot be relied on to reset them.
  const reset = page.getByRole("button", {
    name: /reset colours to the palette/i,
  });
  if (await reset.isVisible().catch(() => false)) await reset.click();

  await pick(page, "paletteId", "crimson");
  await pick(page, "fontPair", "modern");
  await pick(page, "preset", "grid");
  await save(page);
}

test.describe("theme editor", () => {
  test("owner changes the palette and the public site follows", async ({
    page,
  }) => {
    const tenantId = await signIn(page, ALPHA_OWNER);

    await page.getByRole("link", { name: "Look" }).click();
    await page.waitForLoadState("networkidle");

    await pick(page, "paletteId", "navy");
    await save(page);

    // Loading the real site rather than trusting what the browser drew: this
    // proves the change reached the database.
    await page.goto(ALPHA_SITE);
    const accent = await page
      .locator("[style*='--color-accent']")
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--color-accent"));
    expect(accent.trim()).toBe("#1c3f6e");

    await restoreSeedTheme(page, tenantId);
  });

  test("changing the layout preset reaches the public site", async ({
    page,
  }) => {
    const tenantId = await signIn(page, ALPHA_OWNER);
    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });

    await pick(page, "preset", "list");
    await save(page);

    await page.goto(ALPHA_SITE);
    await expect(page.locator("ul[data-preset]").first()).toHaveAttribute(
      "data-preset",
      "list",
    );
    // The list preset's typographic signature must come back with it.
    await expect(page.locator(".leader").first()).toBeAttached();

    await restoreSeedTheme(page, tenantId);
  });

  test("changing the font pairing reaches the public site", async ({
    page,
  }) => {
    const tenantId = await signIn(page, ALPHA_OWNER);
    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });

    await pick(page, "fontPair", "warm");
    await save(page);

    await page.goto(ALPHA_SITE);
    await expect(page.getByRole("heading", { name: "Alpha Grill" })).toHaveCSS(
      "font-family",
      /Tajawal/,
    );

    await restoreSeedTheme(page, tenantId);
  });

  test("hides operator-only colour controls from an owner", async ({
    page,
  }) => {
    const tenantId = await signIn(page, ALPHA_OWNER);
    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });

    await expect(page.getByText("Exact colours")).toHaveCount(0);
    await expect(page.locator("input[type=color]")).toHaveCount(0);
  });

  test("shows a live preview of the candidate theme", async ({ page }) => {
    const tenantId = await signIn(page, ALPHA_OWNER);
    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });

    const preview = page.locator("[style*='--color-accent']").last();

    // Selecting a palette must repaint the preview with no round trip -- that
    // is the entire point of previewing before saving.
    await pick(page, "paletteId", "charcoal");
    await expect(preview).toHaveCSS("background-color", "rgb(26, 24, 21)");

    await pick(page, "paletteId", "navy");
    await expect(preview).toHaveCSS("background-color", "rgb(255, 255, 255)");

    await restoreSeedTheme(page, tenantId);
  });
});

test.describe("operator colour controls", () => {
  test("shows per-token colour entry to a platform operator", async ({
    page,
  }) => {
    const tenantId = await signIn(page, OPERATOR);
    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });

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
  }) => {
    const tenantId = await signIn(page, OPERATOR);
    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });

    // Near-white secondary text on a white background: unreadable, and the
    // exact mistake owners make because they never think to touch `muted`.
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
     * Two alerts are expected here, and the distinction is the point: the
     * client's live warning ("hard to read") is advisory, while the Server
     * Action's refusal ("not readable") is the boundary. Only the second one
     * proves the save was actually rejected server-side.
     */
    await expect(
      page.getByRole("alert").filter({ hasText: /Those colours are not readable/i }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);

    // And nothing was written: the site keeps its seeded muted colour.
    await page.goto(ALPHA_SITE);
    const muted = await page
      .locator("[style*='--color-accent']")
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--color-muted"));
    expect(muted.trim()).toBe("#5f5c58");

    await restoreSeedTheme(page, tenantId);
  });

  test("saves a readable operator override and the site follows", async ({
    page,
  }) => {
    const tenantId = await signIn(page, OPERATOR);
    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });

    await setColour(page, "accent", "#7b1020");
    await save(page);

    await page.goto(ALPHA_SITE);
    const accent = await page
      .locator("[style*='--color-accent']")
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--color-accent"));
    expect(accent.trim()).toBe("#7b1020");

    await restoreSeedTheme(page, tenantId);
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
  }) => {
    const tenantId = await signIn(page, OPERATOR);
    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });

    const reset = page.getByRole("button", {
      name: /reset colours to the palette/i,
    });

    // A fresh seeded tenant has no overrides at all.
    await expect(reset).toHaveCount(0);

    // Changing one colour creates exactly one override.
    await setColour(page, "accent", "#7b1020");
    await expect(reset).toBeVisible();
    await save(page);

    // Saving an untouched palette must not materialise the other six.
    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });
    await reset.click();
    await save(page);

    await page.goto(`${ADMIN}/${tenantId}/theme`, { waitUntil: "networkidle" });
    await expect(reset).toHaveCount(0);

    await restoreSeedTheme(page, tenantId);
  });
});
