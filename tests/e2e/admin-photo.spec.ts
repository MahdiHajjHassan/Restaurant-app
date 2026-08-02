import { expect, test, type Page } from "@playwright/test";

/**
 * Dish photo upload, end to end.
 *
 * Requires the seed plus the demo admins, and the fixtures from
 * `node scripts/make-image-fixtures.mjs`.
 */
/*
 * Serial: these mutate one shared database, and the uploaded photo is global
 * state that the public-site assertions depend on.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = "http://app.localhost:3000";
const ALPHA_SITE = "http://alpha-grill.localhost:3000";
const ALPHA_OWNER = "owner@alpha-grill.test";
const DEMO_PASSWORD = "demo-password-123";

/** Large, portrait, orientation-tagged and GPS-tagged, like a real phone photo. */
const PHONE_PHOTO = "tests/fixtures/phone-photo.jpg";

async function signInToTenant(page: Page): Promise<string> {
  await page.context().clearCookies();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(ALPHA_OWNER);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url().split("/").pop()!;
}

async function openHummus(page: Page, tenantId: string) {
  await page.goto(`${ADMIN}/${tenantId}`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Hummus/ }).first().click();
  await page.waitForLoadState("networkidle");
}

test.describe("dish photo upload", () => {
  test("uploads a phone photo and shows it on the public menu", async ({
    page,
  }) => {
    const tenantId = await signInToTenant(page);
    await openHummus(page, tenantId);

    await page.setInputFiles('input[type="file"]', PHONE_PHOTO);

    // The field submits on pick -- one tap in a kitchen, not two.
    await expect(page.getByText(/photo saved/i)).toBeVisible({
      timeout: 30_000,
    });

    /*
     * The dish carries a real <img> on the public grid. Reading naturalWidth
     * rather than just asserting the element exists: a broken src still renders
     * an <img> tag, and naturalWidth of 0 is exactly what that looks like.
     */
    await page.goto(ALPHA_SITE, { waitUntil: "networkidle" });

    const photo = page.locator("li[data-item] img").first();
    await expect(photo).toBeVisible();

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
  }) => {
    await page.goto(ALPHA_SITE, { waitUntil: "networkidle" });

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

    const response = await page.request.get(
      `http://127.0.0.1:3000/storage/${key![0]}`,
      { headers: { Host: "alpha-grill.localhost" } },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
    expect(response.headers()["cache-control"]).toContain("immutable");
  });

  test("refuses a file that is not an image", async ({ page }) => {
    const tenantId = await signInToTenant(page);
    await openHummus(page, tenantId);

    // package.json renamed. The declared type says image/jpeg; the magic bytes
    // do not, and the magic bytes are what the server trusts.
    await page.setInputFiles('input[type="file"]', {
      name: "not-a-photo.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from('{"name":"definitely-not-an-image"}'),
    });

    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText(/not a photo/i);
  });

  test("removes a photo and the card degrades cleanly", async ({ page }) => {
    const tenantId = await signInToTenant(page);
    await openHummus(page, tenantId);

    await page.getByRole("button", { name: /remove photo/i }).click();
    await expect(
      page.getByRole("button", { name: /remove photo/i }),
    ).toHaveCount(0, { timeout: 15_000 });

    // The grid must still render -- a dish with no photo is the common case,
    // not an error state.
    await page.goto(ALPHA_SITE, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Hummus" })).toBeVisible();
    await expect(page.locator("li[data-item] img")).toHaveCount(0);
  });
});
