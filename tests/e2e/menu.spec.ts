import { expect, test } from "@playwright/test";

/** Requires the seed: scripts/db/seed.sql */
const ALPHA = "http://alpha-grill.localhost:3000";

test.describe("public menu", () => {
  test("shows categories, dishes and formatted prices", async ({ page }) => {
    await page.goto(ALPHA);

    await expect(page.getByRole("heading", { name: "Alpha Grill" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Starters" })).toBeVisible();
    await expect(page.getByText("Hummus")).toBeVisible();
    // Minor units rendered through the tenant's currency, not raw integers.
    await expect(page.getByText("$6.50")).toBeVisible();
  });

  test("keeps a sold-out dish on the menu, struck through", async ({ page }) => {
    await page.goto(ALPHA);

    // Removing it would tell the customer the dish does not exist. It stays,
    // crossed off, and one tap in admin brings it back.
    const soldOut = page.getByRole("heading", { name: "Lamb Kafta" });
    await expect(soldOut).toBeVisible();
    await expect(soldOut).toHaveCSS("text-decoration-line", "line-through");
    await expect(page.getByText("Sold out")).toBeVisible();
  });

  test("shows size variants with their own prices", async ({ page }) => {
    await page.goto(ALPHA);

    await expect(page.getByText("$12.50")).toBeVisible();
    await expect(page.getByText("$18.50")).toBeVisible();
  });

  test("filters the menu as you search", async ({ page }) => {
    await page.goto(ALPHA);

    await page.getByRole("searchbox").fill("hummus");

    await expect(page.getByText("Hummus")).toBeVisible();
    await expect(page.getByText("Fresh Lemonade")).toBeHidden();
    // A whole category with no remaining matches must disappear too, or the
    // page shows headings with nothing under them.
    await expect(page.getByRole("heading", { name: "Drinks" })).toBeHidden();
  });

  test("explains an empty search rather than going blank", async ({ page }) => {
    await page.goto(ALPHA);

    await page.getByRole("searchbox").fill("sushi");

    await expect(page.getByText("No dishes match that search.")).toBeVisible();
  });

  test("search matches Arabic text from the English page", async ({ page }) => {
    // data-search carries both languages, so a customer typing Arabic on the
    // English page still finds the dish.
    await page.goto(ALPHA);

    await page.getByRole("searchbox").fill("حمص");

    await expect(page.getByText("Hummus")).toBeVisible();
  });
});

test.describe("Arabic", () => {
  test("mirrors the layout and translates the menu", async ({ page }) => {
    await page.goto(`${ALPHA}/ar`);

    await expect(page.locator("[dir=rtl]").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "المقبلات" })).toBeVisible();
    await expect(page.getByText("حمص")).toBeVisible();
  });

  test("renders prices in Latin digits", async ({ page }) => {
    await page.goto(`${ALPHA}/ar`);

    const body = await page.locator("body").innerText();
    expect(body).toContain("6.50");
    // Arabic-Indic digits would mean the owner sees one price in admin and a
    // different-looking one on their own site.
    expect(body).not.toMatch(/[٠-٩]/);
  });

  test("falls back to English where Arabic is blank", async ({ page }) => {
    // Owners fill in English first and reach Arabic later, if ever. A blank
    // Arabic field must not render an empty menu row.
    await page.goto(`${ALPHA}/ar`);

    await expect(page.getByText("Chickpea, tahini, olive oil")).toBeVisible();
  });

  test("switches between languages", async ({ page }) => {
    await page.goto(ALPHA);
    await page.getByRole("link", { name: "العربية" }).click();

    await expect(page).toHaveURL(`${ALPHA}/ar`);
    await expect(page.getByRole("heading", { name: "المقبلات" })).toBeVisible();
  });
});

test.describe("search engine surface", () => {
  test("emits Restaurant structured data including the menu", async ({
    page,
  }) => {
    await page.goto(ALPHA);

    const raw = await page.locator('script[type="application/ld+json"]').innerText();
    const schema = JSON.parse(raw);

    expect(schema["@type"]).toBe("Restaurant");
    expect(schema.name).toBe("Alpha Grill");
    expect(schema.openingHoursSpecification).toBeTruthy();
    expect(schema.hasMenu.hasMenuSection.length).toBeGreaterThan(0);
  });

  test("marks a sold-out dish as out of stock", async ({ page }) => {
    await page.goto(ALPHA);

    const raw = await page.locator('script[type="application/ld+json"]').innerText();
    const schema = JSON.parse(raw);
    const allItems = schema.hasMenu.hasMenuSection.flatMap(
      (section: { hasMenuItem: unknown[] }) => section.hasMenuItem,
    );
    const kafta = allItems.find(
      (item: { name: string }) => item.name === "Lamb Kafta",
    );

    // Search results must not promise a dish that is off tonight.
    expect(kafta.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  test("pairs the two languages with hreflang", async ({ page }) => {
    await page.goto(ALPHA);

    const alternate = page.locator('link[rel="alternate"][hreflang="ar"]');
    await expect(alternate).toHaveCount(1);
  });

  /*
   * These hit the loopback address with an explicit Host header rather than a
   * *.localhost URL. Chrome resolves *.localhost internally, but Playwright's
   * request fixture goes through Node's resolver, which does not -- and this
   * exercises host-based routing more directly anyway.
   */
  test("serves a per-tenant sitemap and robots", async ({ request }) => {
    const headers = { Host: "alpha-grill.localhost" };

    const sitemap = await request.get("http://127.0.0.1:3000/sitemap.xml", {
      headers,
    });
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("alpha-grill.localhost");

    const robots = await request.get("http://127.0.0.1:3000/robots.txt", {
      headers,
    });
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Sitemap:");
  });

  test("tells crawlers to stay away from an unknown host", async ({
    request,
  }) => {
    const robots = await request.get("http://127.0.0.1:3000/robots.txt", {
      headers: { Host: "nobody-here.localhost" },
    });
    expect(await robots.text()).toContain("Disallow: /");
  });
});
