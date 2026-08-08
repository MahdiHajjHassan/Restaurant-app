import { type Page } from "@playwright/test";
import { expect, test, type Sandbox } from "./support/sandbox";
import { ADMIN, PORT } from "./support/urls";

/**
 * Dish photo and logo upload, end to end.
 *
 * Self-provisioning via the `sandbox` fixture, so this writes only to its own
 * project's restaurant. Also needs the image fixtures:
 * `npm run fixtures`.
 */
/*
 * Serial within the project: these upload to and remove from the same dish.
 * Across projects, isolation is by data -- see tests/e2e/support/sandbox.ts.
 */
test.describe.configure({ mode: "serial" });

/** Large, portrait, orientation-tagged and GPS-tagged, like a real phone photo. */
const PHONE_PHOTO = "tests/fixtures/phone-photo.jpg";

async function signInAsOwner(page: Page, sandbox: Sandbox) {
  await page.context().clearCookies();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(sandbox.owner);
  await page.getByLabel("Password").fill(sandbox.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(new RegExp(`/${sandbox.id}$`), { timeout: 15_000 });
}

/**
 * Photos only render in the grid and editorial presets -- the list preset is
 * the leader-rule row and deliberately shows none. The sandbox starts on list,
 * and the theme specs may move it, so any test asserting on a public card sets
 * this itself rather than assuming.
 */
async function useGridPreset(page: Page, sandbox: Sandbox) {
  await page.goto(`${ADMIN}/${sandbox.id}/theme`, { waitUntil: "networkidle" });
  await page
    .locator('label:has(input[name="preset"][value="grid"])')
    .click();
  await page.getByRole("button", { name: /save look/i }).click();
  await expect(page.getByRole("status")).toBeVisible();
}

async function openDish(page: Page, sandbox: Sandbox, name: string) {
  await page.goto(`${ADMIN}/${sandbox.id}`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: new RegExp(name) }).first().click();
  await page.waitForLoadState("networkidle");
}

test.describe("dish photo upload", () => {
  test("uploads a phone photo and shows it on the public menu", async ({
    page,
    sandbox,
  }) => {
    await signInAsOwner(page, sandbox);
    await useGridPreset(page, sandbox);
    await openDish(page, sandbox, "Hummus");

    await page.setInputFiles('input[type="file"]', PHONE_PHOTO);

    // The field submits on pick -- one tap in a kitchen, not two.
    await expect(page.getByText(/photo saved/i)).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(sandbox.site, { waitUntil: "networkidle" });

    const photo = page.locator("li[data-item] img").first();
    await expect(photo).toBeVisible();

    /*
     * naturalWidth rather than merely asserting the element exists: a broken
     * src still renders an <img>, and naturalWidth 0 is exactly what that looks
     * like.
     */
    const dimensions = await photo.evaluate((el: HTMLImageElement) => ({
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
    }));
    expect(dimensions.naturalWidth).toBeGreaterThan(0);

    /*
     * Landscape, not portrait. The source is 2000x3000 tagged orientation 6
     * ("rotate 90 clockwise"), so a pipeline that re-encodes before applying
     * orientation would serve it on its side -- with the tag that would have
     * corrected it now stripped.
     */
    expect(dimensions.naturalWidth).toBeGreaterThan(dimensions.naturalHeight);
  });

  test("serves the stored photo with an immutable cache header", async ({
    page,
    sandbox,
  }) => {
    await page.goto(sandbox.site, { waitUntil: "networkidle" });

    const src = await page
      .locator("li[data-item] img")
      .first()
      .getAttribute("src");
    expect(src).toBeTruthy();

    // next/image proxies through /_next/image; the underlying object is what
    // carries the long cache, since its key is uuid-based and never reused.
    const key = decodeURIComponent(src!).match(
      /tenants\/[0-9a-f-]+\/media\/[0-9a-f-]+\.webp/,
    );
    expect(key).not.toBeNull();

    // 127.0.0.1 with an explicit Host: Playwright's request fixture uses the OS
    // resolver, which does not know *.localhost.
    const response = await page.request.get(
      `http://127.0.0.1:${PORT}/storage/${key![0]}`,
      { headers: { Host: `${sandbox.slug}.localhost` } },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
    expect(response.headers()["cache-control"]).toContain("immutable");
  });

  test("refuses a file that is not an image", async ({ page, sandbox }) => {
    await signInAsOwner(page, sandbox);
    await openDish(page, sandbox, "Hummus");

    // The declared type says image/jpeg; the magic bytes do not, and the magic
    // bytes are what the server trusts.
    await page.setInputFiles('input[type="file"]', {
      name: "not-a-photo.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from('{"name":"definitely-not-an-image"}'),
    });

    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText(/not a photo/i);
  });

  test("uploads a logo that replaces the name in the site header", async ({
    page,
    sandbox,
  }) => {
    await signInAsOwner(page, sandbox);
    await page.goto(`${ADMIN}/${sandbox.id}/theme`, {
      waitUntil: "networkidle",
    });

    await page.setInputFiles('input[name="logo"]', PHONE_PHOTO);
    await expect(
      page.getByAltText(new RegExp(`${sandbox.name} logo`, "i")),
    ).toBeVisible({ timeout: 30_000 });

    await page.goto(sandbox.site, { waitUntil: "networkidle" });

    /*
     * The name must survive as alt text. Replacing the heading with a bare
     * image would tell a screen reader and a search engine nothing about whose
     * restaurant this is.
     */
    const logo = page.getByRole("heading").getByRole("img");
    await expect(logo).toHaveAttribute("alt", sandbox.name);

    // Capped height: a tall upload must not push the menu below the fold.
    const height = await logo.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBeLessThanOrEqual(40);

    // Remove it again, and the name must come back.
    await page.goto(`${ADMIN}/${sandbox.id}/theme`, {
      waitUntil: "networkidle",
    });
    // The confirmation, not the button's absence: the button is rendered
    // `currentLogo && !pending`, so it also vanishes while the write is still
    // in flight.
    await page.getByRole("button", { name: /remove logo/i }).click();
    await expect(page.getByText(/logo removed/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(sandbox.site);
    await expect(
      page.getByRole("heading", { name: sandbox.name }),
    ).toBeVisible();
  });

  test("removes a photo and the card degrades cleanly", async ({
    page,
    sandbox,
  }) => {
    await signInAsOwner(page, sandbox);
    await useGridPreset(page, sandbox);

    // Give a second dish a photo, so the assertion below distinguishes "this
    // card lost its photo" from "the whole grid is empty".
    await openDish(page, sandbox, "Fattoush");
    await page.setInputFiles('input[type="file"]', PHONE_PHOTO);
    await expect(page.getByText(/photo saved/i)).toBeVisible({
      timeout: 30_000,
    });

    await openDish(page, sandbox, "Hummus");
    await page.getByRole("button", { name: /remove photo/i }).click();

    /*
     * Wait for the confirmation, NOT for the button to disappear.
     *
     * The button is rendered `currentImage && !pending`, so it also vanishes
     * the instant submission starts -- waiting on that returns while the write
     * is still in flight, and the assertions below then race the action's
     * transaction. The success message only renders once the action has
     * returned.
     */
    await expect(page.getByText(/photo removed/i)).toBeVisible({
      timeout: 15_000,
    });

    /*
     * A dish with no photo is the common case, not an error state: the grid has
     * to keep rendering and the gap has to look deliberate.
     */
    await page.goto(sandbox.site, { waitUntil: "networkidle" });

    const hummus = page
      .locator("li[data-item]")
      .filter({ has: page.getByRole("heading", { name: "Hummus" }) });

    await expect(hummus).toHaveCount(1);
    await expect(hummus.locator("img")).toHaveCount(0);

    // The neighbouring dish still shows its photo, so the grid is intact.
    await expect(page.locator("li[data-item] img").first()).toBeVisible();
  });
});
