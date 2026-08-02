import { and, asc, eq } from "drizzle-orm";
import type { TenantSession } from "../db/tenant";
import { categories, itemVariants, items } from "../db/schema";

export type Category = typeof categories.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemVariant = typeof itemVariants.$inferSelect;

export type MenuItem = Item & { variants: ItemVariant[] };
export type MenuCategory = Category & { items: MenuItem[] };

/**
 * Callers never supply `tenantId` -- it is taken from the session. Accepting it
 * as input would reintroduce exactly the mistake this layer exists to prevent:
 * a caller passing the wrong one, or an attacker supplying someone else's.
 */
export type NewCategory = Omit<
  typeof categories.$inferInsert,
  "tenantId" | "id" | "createdAt" | "updatedAt"
>;
export type NewItem = Omit<
  typeof items.$inferInsert,
  "tenantId" | "id" | "createdAt" | "updatedAt"
>;
export type NewItemVariant = Omit<
  typeof itemVariants.$inferInsert,
  "tenantId" | "id" | "createdAt" | "updatedAt"
>;

/**
 * Menu repository, bound to one tenant.
 *
 * Every statement below ALSO filters on tenantId even though RLS would already
 * enforce it. That redundancy is the point: the two layers are independent, so
 * a mistake in either one alone cannot leak data across restaurants.
 */
export function createMenuRepository(session: TenantSession) {
  const { tx, tenantId } = session;

  return {
    async listCategories(): Promise<Category[]> {
      return tx
        .select()
        .from(categories)
        .where(eq(categories.tenantId, tenantId))
        .orderBy(asc(categories.sortOrder), asc(categories.nameEn));
    },

    async listVisibleCategories(): Promise<Category[]> {
      return tx
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.tenantId, tenantId),
            eq(categories.isVisible, true),
          ),
        )
        .orderBy(asc(categories.sortOrder), asc(categories.nameEn));
    },

    async listItems(): Promise<Item[]> {
      return tx
        .select()
        .from(items)
        .where(eq(items.tenantId, tenantId))
        .orderBy(asc(items.sortOrder), asc(items.nameEn));
    },

    async listItemsInCategory(categoryId: string): Promise<Item[]> {
      return tx
        .select()
        .from(items)
        .where(
          and(eq(items.tenantId, tenantId), eq(items.categoryId, categoryId)),
        )
        .orderBy(asc(items.sortOrder), asc(items.nameEn));
    },

    async listVariants(itemId: string): Promise<ItemVariant[]> {
      return tx
        .select()
        .from(itemVariants)
        .where(
          and(
            eq(itemVariants.tenantId, tenantId),
            eq(itemVariants.itemId, itemId),
          ),
        )
        .orderBy(asc(itemVariants.sortOrder));
    },

    /**
     * The whole public menu in three queries, not one per category.
     *
     * A 90-item menu across 8 categories would be 17 round trips if items and
     * variants were fetched per parent. Three flat queries assembled in memory
     * is what keeps the page inside its latency budget on a phone.
     *
     * The three run SEQUENTIALLY, not under Promise.all. A transaction is
     * pinned to a single connection, and PostgreSQL cannot process concurrent
     * queries on one connection -- issuing them in parallel corrupts the
     * protocol rather than going faster.
     *
     * Sold-out items are included deliberately: they render struck through
     * rather than vanishing, so a customer sees the dish exists and the owner
     * restores it with one tap.
     */
    async getPublicMenu(): Promise<MenuCategory[]> {
      const categoryRows = await tx
        .select()
        .from(categories)
        .where(
          and(eq(categories.tenantId, tenantId), eq(categories.isVisible, true)),
        )
        .orderBy(asc(categories.sortOrder), asc(categories.nameEn));

      const itemRows = await tx
        .select()
        .from(items)
        .where(eq(items.tenantId, tenantId))
        .orderBy(asc(items.sortOrder), asc(items.nameEn));

      const variantRows = await tx
        .select()
        .from(itemVariants)
        .where(eq(itemVariants.tenantId, tenantId))
        .orderBy(asc(itemVariants.sortOrder));

      const variantsByItem = new Map<string, ItemVariant[]>();
      for (const variant of variantRows) {
        const list = variantsByItem.get(variant.itemId);
        if (list) list.push(variant);
        else variantsByItem.set(variant.itemId, [variant]);
      }

      const itemsByCategory = new Map<string, MenuItem[]>();
      for (const item of itemRows) {
        const withVariants: MenuItem = {
          ...item,
          variants: variantsByItem.get(item.id) ?? [],
        };
        const list = itemsByCategory.get(item.categoryId);
        if (list) list.push(withVariants);
        else itemsByCategory.set(item.categoryId, [withVariants]);
      }

      // Empty categories are dropped: a heading with nothing under it makes a
      // menu look broken or unfinished.
      return categoryRows
        .map((category) => ({
          ...category,
          items: itemsByCategory.get(category.id) ?? [],
        }))
        .filter((category) => category.items.length > 0);
    },

    async createCategory(input: NewCategory): Promise<Category> {
      const [row] = await tx
        .insert(categories)
        .values({ ...input, tenantId })
        .returning();
      if (!row) throw new Error("Insert returned no category row");
      return row;
    },

    async createItem(input: NewItem): Promise<Item> {
      const [row] = await tx
        .insert(items)
        .values({ ...input, tenantId })
        .returning();
      if (!row) throw new Error("Insert returned no item row");
      return row;
    },

    async createVariant(input: NewItemVariant): Promise<ItemVariant> {
      const [row] = await tx
        .insert(itemVariants)
        .values({ ...input, tenantId })
        .returning();
      if (!row) throw new Error("Insert returned no item variant row");
      return row;
    },

    /**
     * The control restaurant owners use daily. Never deletes -- sold out today
     * comes back tomorrow with one tap.
     */
    async setItemAvailability(
      itemId: string,
      isAvailable: boolean,
    ): Promise<Item | null> {
      const [row] = await tx
        .update(items)
        .set({ isAvailable, updatedAt: new Date() })
        .where(and(eq(items.tenantId, tenantId), eq(items.id, itemId)))
        .returning();
      return row ?? null;
    },
  };
}

export type MenuRepository = ReturnType<typeof createMenuRepository>;
