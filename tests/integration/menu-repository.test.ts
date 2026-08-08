import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/core/db/client";
import { withTenant } from "@/core/db/tenant";
import { createMenuRepository } from "@/core/menu/repository";

/**
 * The menu write path, against a real PostgreSQL.
 *
 * Integration rather than unit: every assertion here is about what the database
 * actually does -- what a DELETE cascades to, what a scoped UPDATE matches, what
 * a foreign id does NOT match. A mocked Drizzle would prove none of it.
 *
 * Cleanup is scoped to this file's own slugs. It must NEVER truncate: other
 * integration files run concurrently and would lose their fixtures mid-test.
 */

const SLUG_A = "menu-repo-a";
const SLUG_B = "menu-repo-b";
/** Never given a category by any other test, so "empty" genuinely means empty. */
const SLUG_FRESH = "menu-repo-fresh";

let db: Database;
let appPool: Pool;
let adminPool: Pool;
let tenantA: string;
let tenantB: string;
let tenantFresh: string;

async function reset(): Promise<void> {
  await adminPool.query("DELETE FROM tenants WHERE slug = ANY($1::text[])", [
    [SLUG_A, SLUG_B, SLUG_FRESH],
  ]);
}

beforeAll(async () => {
  const appUrl = process.env.DATABASE_URL;
  const adminUrl = process.env.MIGRATION_DATABASE_URL;
  if (!appUrl || !adminUrl) {
    throw new Error("DATABASE_URL and MIGRATION_DATABASE_URL must be set");
  }

  ({ db, pool: appPool } = createDatabase({
    connectionString: appUrl,
    maxConnections: 5,
  }));
  adminPool = new Pool({ connectionString: adminUrl, max: 2 });

  await reset();

  const seeded = await adminPool.query<{ id: string }>(
    `INSERT INTO tenants (slug, name, currency, timezone)
     VALUES ($1, 'Menu Repo A', 'USD', 'Asia/Beirut'),
            ($2, 'Menu Repo B', 'USD', 'Asia/Beirut'),
            ($3, 'Menu Repo Fresh', 'USD', 'Asia/Beirut')
     RETURNING id`,
    [SLUG_A, SLUG_B, SLUG_FRESH],
  );
  tenantA = seeded.rows[0]!.id;
  tenantB = seeded.rows[1]!.id;
  tenantFresh = seeded.rows[2]!.id;
});

afterAll(async () => {
  await reset();
  await Promise.all([appPool.end(), adminPool.end()]);
});

/** Fresh category for one test, so tests do not inherit each other's rows. */
async function makeCategory(tenantId: string, nameEn: string) {
  return withTenant(db, tenantId, (session) =>
    createMenuRepository(session).createCategory({ nameEn }),
  );
}

describe("categories", () => {
  it("renames, hides and finds a category", async () => {
    const created = await makeCategory(tenantA, "Sarters");

    const renamed = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).updateCategory(created.id, {
        nameEn: "Starters",
        nameAr: "المقبلات",
        isVisible: false,
      }),
    );

    expect(renamed?.nameEn).toBe("Starters");
    expect(renamed?.nameAr).toBe("المقبلات");
    expect(renamed?.isVisible).toBe(false);

    const found = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).findCategory(created.id),
    );
    expect(found?.nameEn).toBe("Starters");
  });

  it("refuses to touch another tenant's category, and leaves it intact", async () => {
    const foreign = await makeCategory(tenantB, "Beta Only");

    const updated = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).updateCategory(foreign.id, {
        nameEn: "Stolen",
      }),
    );
    const deleted = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).deleteCategory(foreign.id),
    );

    expect(updated).toBeNull();
    expect(deleted).toBeNull();

    // The row must still be there, unchanged -- "returned null" is not the same
    // as "did nothing".
    const survivor = await withTenant(db, tenantB, (session) =>
      createMenuRepository(session).findCategory(foreign.id),
    );
    expect(survivor?.nameEn).toBe("Beta Only");
  });

  it("counts dishes, then takes them with the category", async () => {
    const category = await makeCategory(tenantA, "Grills");
    await withTenant(db, tenantA, async (session) => {
      const repo = createMenuRepository(session);
      // Sequential: one transaction, one connection.
      for (const nameEn of ["Taouk", "Kafta", "Lahm"]) {
        await repo.createItem({
          categoryId: category.id,
          nameEn,
          basePriceMinor: 1450,
        });
      }
    });

    const count = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).countItemsInCategory(category.id),
    );
    // This is the number the confirmation promises the owner. If it can drift
    // from what actually gets deleted, the confirmation is a lie.
    expect(count).toBe(3);

    const removed = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).deleteCategory(category.id),
    );
    expect(removed?.nameEn).toBe("Grills");

    const orphans = await withTenant(db, tenantA, async (session) => {
      const all = await createMenuRepository(session).listItems();
      return all.filter((item) => item.categoryId === category.id);
    });
    expect(orphans).toEqual([]);
  });

  it("hands out the next sort order, starting at zero", async () => {
    // A restaurant that has never had a section -- which is precisely the
    // state an owner starts in on day one.
    const empty = await withTenant(db, tenantFresh, (session) =>
      createMenuRepository(session).nextCategorySortOrder(),
    );
    expect(empty).toBe(0);

    await withTenant(db, tenantFresh, async (session) => {
      const repo = createMenuRepository(session);
      await repo.createCategory({ nameEn: "First", sortOrder: 0 });
      await repo.createCategory({ nameEn: "Second", sortOrder: 7 });
    });

    const next = await withTenant(db, tenantFresh, (session) =>
      createMenuRepository(session).nextCategorySortOrder(),
    );
    // max + 1, not count: a deleted middle row must not hand out a duplicate.
    expect(next).toBe(8);
  });
});

describe("dishes and variants", () => {
  it("deletes a dish and returns what went", async () => {
    const category = await makeCategory(tenantA, "Salads");
    const dish = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).createItem({
        categoryId: category.id,
        nameEn: "Fattoush",
        basePriceMinor: 800,
      }),
    );

    const removed = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).deleteItem(dish.id),
    );
    expect(removed?.nameEn).toBe("Fattoush");

    const again = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).findItem(dish.id),
    );
    expect(again).toBeNull();
  });

  it("will not delete another tenant's dish", async () => {
    const category = await makeCategory(tenantB, "Beta Mains");
    const dish = await withTenant(db, tenantB, (session) =>
      createMenuRepository(session).createItem({
        categoryId: category.id,
        nameEn: "Beta Burger",
        basePriceMinor: 1250,
      }),
    );

    const attempt = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).deleteItem(dish.id),
    );
    expect(attempt).toBeNull();

    const survivor = await withTenant(db, tenantB, (session) =>
      createMenuRepository(session).findItem(dish.id),
    );
    expect(survivor?.nameEn).toBe("Beta Burger");
  });

  it("numbers new dishes per category, not per restaurant", async () => {
    const first = await makeCategory(tenantA, "Sort One");
    const second = await makeCategory(tenantA, "Sort Two");

    await withTenant(db, tenantA, async (session) => {
      const repo = createMenuRepository(session);
      await repo.createItem({
        categoryId: first.id,
        nameEn: "A",
        basePriceMinor: 100,
        sortOrder: 0,
      });
      await repo.createItem({
        categoryId: first.id,
        nameEn: "B",
        basePriceMinor: 100,
        sortOrder: 1,
      });
    });

    const nextInFirst = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).nextItemSortOrder(first.id),
    );
    const nextInSecond = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).nextItemSortOrder(second.id),
    );

    expect(nextInFirst).toBe(2);
    // A dish added to an empty category starts at 0 even though the restaurant
    // already has dishes elsewhere.
    expect(nextInSecond).toBe(0);
  });

  it("edits and deletes a variant", async () => {
    const category = await makeCategory(tenantA, "Pizza");
    const dish = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).createItem({
        categoryId: category.id,
        nameEn: "Margherita",
        basePriceMinor: 900,
      }),
    );
    const variant = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).createVariant({
        itemId: dish.id,
        nameEn: "Smal",
        priceMinor: 900,
      }),
    );

    const edited = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).updateVariant(variant.id, {
        nameEn: "Small",
        priceMinor: 950,
      }),
    );
    expect(edited?.nameEn).toBe("Small");
    expect(edited?.priceMinor).toBe(950);

    const removed = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).deleteVariant(variant.id),
    );
    expect(removed?.id).toBe(variant.id);

    const left = await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).listVariants(dish.id),
    );
    expect(left).toEqual([]);
  });
});

describe("reordering", () => {
  it("writes sort order from array position", async () => {
    const drinks = await makeCategory(tenantA, "Reorder Drinks");

    const ids = await withTenant(db, tenantA, async (session) => {
      const repo = createMenuRepository(session);
      const created = [];
      for (const nameEn of ["Water", "Juice", "Coffee"]) {
        created.push(
          await repo.createItem({
            categoryId: drinks.id,
            nameEn,
            basePriceMinor: 200,
            sortOrder: created.length,
          }),
        );
      }
      return created.map((row) => row.id);
    });

    // Coffee to the front.
    await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).reorderItems(drinks.id, [
        ids[2]!,
        ids[0]!,
        ids[1]!,
      ]),
    );

    const names = await withTenant(db, tenantA, async (session) =>
      (await createMenuRepository(session).listItemsInCategory(drinks.id)).map(
        (row) => row.nameEn,
      ),
    );
    expect(names).toEqual(["Coffee", "Water", "Juice"]);
  });

  it("skips an id from another restaurant instead of refusing the whole reorder", async () => {
    // A prefix no other test uses: the assertion below filters on it, and the
    // reordered rows share sort_order 0 with categories left by earlier tests.
    const mine = await makeCategory(tenantA, "Skip Mine");
    const theirs = await makeCategory(tenantB, "Skip Theirs");
    const second = await makeCategory(tenantA, "Skip Second");

    // A stale or hostile client sends an id we must not touch, sandwiched
    // between two we must. Refusing everything would leave the owner unable to
    // reorder at all; obeying it would reach into another restaurant.
    await withTenant(db, tenantA, (session) =>
      createMenuRepository(session).reorderCategories([
        second.id,
        theirs.id,
        mine.id,
      ]),
    );

    const ordered = await withTenant(db, tenantA, async (session) =>
      (await createMenuRepository(session).listCategories())
        .filter((row) => row.nameEn.startsWith("Skip "))
        .map((row) => row.nameEn),
    );
    expect(ordered).toEqual(["Skip Second", "Skip Mine"]);

    const untouched = await withTenant(db, tenantB, (session) =>
      createMenuRepository(session).findCategory(theirs.id),
    );
    expect(untouched?.sortOrder).toBe(0);
  });
});
