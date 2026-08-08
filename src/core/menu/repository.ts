import { and, asc, count, eq, max } from "drizzle-orm";
import type { TenantSession } from "../db/tenant";
import { categories, itemVariants, items, media } from "../db/schema";

export type Category = typeof categories.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemVariant = typeof itemVariants.$inferSelect;

/**
 * Just enough of a media row to render a card: the key to build a URL from, the
 * intrinsic size so the layout can reserve space, and the inline placeholder.
 * Deliberately not the whole row -- byte size and timestamps are of no interest
 * to a customer-facing page.
 */
export interface ItemImage {
  storageKey: string;
  width: number;
  height: number;
  blurDataUrl: string | null;
}

export type MenuItem = Item & {
  variants: ItemVariant[];
  /** Null for a dish with no photo, which is the common case. */
  image: ItemImage | null;
};
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

    async findItem(itemId: string): Promise<Item | null> {
      const rows = await tx
        .select()
        .from(items)
        .where(and(eq(items.tenantId, tenantId), eq(items.id, itemId)))
        .limit(1);
      return rows[0] ?? null;
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

      /*
       * Photos, fetched in one pass rather than joined onto the item query.
       *
       * A left join would repeat every item row per variant further down and
       * make the assembly below harder to follow; one extra scoped SELECT is
       * cheaper to read and to reason about. Sequential like the rest -- these
       * share a transaction, and therefore one connection.
       */
      const mediaRows = await tx
        .select({
          id: media.id,
          storageKey: media.storageKey,
          width: media.width,
          height: media.height,
          blurDataUrl: media.blurDataUrl,
        })
        .from(media)
        .where(eq(media.tenantId, tenantId));

      const mediaById = new Map(mediaRows.map((row) => [row.id, row]));

      const variantsByItem = new Map<string, ItemVariant[]>();
      for (const variant of variantRows) {
        const list = variantsByItem.get(variant.itemId);
        if (list) list.push(variant);
        else variantsByItem.set(variant.itemId, [variant]);
      }

      const itemsByCategory = new Map<string, MenuItem[]>();
      for (const item of itemRows) {
        const image = item.imageId ? mediaById.get(item.imageId) : undefined;

        const withVariants: MenuItem = {
          ...item,
          variants: variantsByItem.get(item.id) ?? [],
          image: image
            ? {
                storageKey: image.storageKey,
                width: image.width,
                height: image.height,
                blurDataUrl: image.blurDataUrl,
              }
            : null,
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

    async findCategory(categoryId: string): Promise<Category | null> {
      const rows = await tx
        .select()
        .from(categories)
        .where(
          and(eq(categories.tenantId, tenantId), eq(categories.id, categoryId)),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async updateCategory(
      categoryId: string,
      changes: Partial<
        Pick<NewCategory, "nameEn" | "nameAr" | "isVisible" | "sortOrder">
      >,
    ): Promise<Category | null> {
      const [row] = await tx
        .update(categories)
        .set({ ...changes, updatedAt: new Date() })
        .where(
          and(eq(categories.tenantId, tenantId), eq(categories.id, categoryId)),
        )
        .returning();
      return row ?? null;
    },

    /**
     * Deletes a category AND, through `items.category_id ON DELETE CASCADE`,
     * every dish under it.
     *
     * Returns the deleted row so the caller can name what went; null means the
     * id belonged to another restaurant, or to nothing.
     */
    async deleteCategory(categoryId: string): Promise<Category | null> {
      const [row] = await tx
        .delete(categories)
        .where(
          and(eq(categories.tenantId, tenantId), eq(categories.id, categoryId)),
        )
        .returning();
      return row ?? null;
    },

    /**
     * The blast radius of deleting a category, for the confirmation to name.
     * Counted from the database rather than from whatever the page rendered
     * some minutes ago -- a stale count turns "and its 14 dishes" into a lie.
     */
    async countItemsInCategory(categoryId: string): Promise<number> {
      const [row] = await tx
        .select({ value: count() })
        .from(items)
        .where(
          and(eq(items.tenantId, tenantId), eq(items.categoryId, categoryId)),
        );
      return row?.value ?? 0;
    },

    /**
     * Appends rather than prepends: a new category belongs at the end of the
     * menu until the owner moves it. max + 1, never count, so deleting a row in
     * the middle cannot hand out a sort order that is already taken.
     */
    async nextCategorySortOrder(): Promise<number> {
      const [row] = await tx
        .select({ value: max(categories.sortOrder) })
        .from(categories)
        .where(eq(categories.tenantId, tenantId));
      return (row?.value ?? -1) + 1;
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
     * Edits a dish. Callers pass only editable fields -- tenantId and id are
     * never writable, so an item cannot be moved to another restaurant.
     *
     * `imageId` is a foreign key into `media`, and PostgreSQL evaluates FK
     * checks as the table owner, which bypasses RLS. A caller who guessed
     * another tenant's media UUID could therefore store it here. That is
     * contained rather than prevented: getPublicMenu resolves photos from a
     * tenant-scoped SELECT, so a foreign id simply resolves to no image. Worth
     * knowing before anyone reads media by id without a tenant filter.
     */
    async updateItem(
      itemId: string,
      changes: Partial<
        Pick<
          NewItem,
          | "nameEn"
          | "nameAr"
          | "descriptionEn"
          | "descriptionAr"
          | "basePriceMinor"
          | "sortOrder"
          | "badges"
          | "categoryId"
          | "imageId"
        >
      >,
    ): Promise<Item | null> {
      const [row] = await tx
        .update(items)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(items.tenantId, tenantId), eq(items.id, itemId)))
        .returning();
      return row ?? null;
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
