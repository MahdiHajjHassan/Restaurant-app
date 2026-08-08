"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/core/db/tenant";
import { createMenuRepository } from "@/core/menu/repository";
import { toMinorUnits } from "@/core/money/format";
import { requireMembership } from "@/server/auth";
import { db } from "@/server/db";

/*
 * Admin mutations.
 *
 * Every action here begins with requireMembership. A signed-in user is not the
 * same as a user entitled to THIS restaurant, and tenantId arrives from the
 * client where it can be tampered with. The check is repeated in each action
 * rather than assumed from the layout, because a layout guard does not run for
 * a Server Action invoked directly.
 */

const uuid = z.string().uuid();

export async function setItemAvailability(
  tenantId: string,
  itemId: string,
  isAvailable: boolean,
): Promise<void> {
  const { membership } = await requireMembership(uuid.parse(tenantId));

  await withTenant(db, membership.tenantId, async (session) => {
    await createMenuRepository(session).setItemAvailability(
      uuid.parse(itemId),
      isAvailable,
    );
  });

  revalidatePath(`/${membership.tenantId}`);
}

const itemInput = z.object({
  nameEn: z.string().trim().min(1, "A dish needs an English name."),
  nameAr: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  descriptionAr: z.string().trim().optional(),
  // Owners type 12.50, the database stores 1250.
  price: z.coerce.number().nonnegative("A price cannot be negative."),
});

export interface ItemFormState {
  error: string | null;
  saved?: boolean;
}

export async function updateItem(
  tenantId: string,
  itemId: string,
  _previous: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));

  const parsed = itemInput.safeParse({
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
    descriptionEn: formData.get("descriptionEn"),
    descriptionAr: formData.get("descriptionAr"),
    price: formData.get("price"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { price, ...text } = parsed.data;

  await withTenant(db, membership.tenantId, async (session) => {
    await createMenuRepository(session).updateItem(uuid.parse(itemId), {
      nameEn: text.nameEn,
      nameAr: text.nameAr || null,
      descriptionEn: text.descriptionEn || null,
      descriptionAr: text.descriptionAr || null,
      basePriceMinor: toMinorUnits(price, membership.currency),
    });
  });

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true };
}

/*
 * ─── Menu building ────────────────────────────────────────────────────────
 *
 * Everything below exists so that onboarding a restaurant stops meaning
 * hand-written SQL. The same three rules as above apply to every one of them:
 * requireMembership first, no redirect(), revalidate after the write.
 */

/**
 * The result every menu mutation returns.
 *
 * `saved` drives the confirmation a test can wait on -- a control that merely
 * disappears proves only that submission STARTED, so nothing may treat that as
 * evidence the write landed. `message` carries a specific sentence where the
 * generic one would hide something the owner needs to know, like how many
 * dishes went with a section.
 */
export interface MenuActionState {
  error: string | null;
  saved?: boolean;
  message?: string;
}

const uuidList = z.array(uuid).min(1);

const categoryInput = z.object({
  nameEn: z.string().trim().min(1, "A section needs a name."),
  nameAr: z.string().trim().optional(),
});

export async function createCategory(
  tenantId: string,
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));

  const parsed = categoryInput.safeParse({
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  await withTenant(db, membership.tenantId, async (session) => {
    const repo = createMenuRepository(session);
    // Sequential: these share one transaction, and therefore one connection.
    const sortOrder = await repo.nextCategorySortOrder();
    await repo.createCategory({
      nameEn: parsed.data.nameEn,
      // Blank Arabic is stored as null, never "": the site falls back to
      // English on null, and an empty string would render as a blank heading.
      nameAr: parsed.data.nameAr || null,
      sortOrder,
    });
  });

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true };
}

/**
 * Serves both rename and hide/show -- two controls, one write. Takes a changes
 * object rather than FormData because the hide toggle is a button, not a form.
 */
export async function updateCategory(
  tenantId: string,
  categoryId: string,
  changes: { nameEn?: string; nameAr?: string; isVisible?: boolean },
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));
  const id = uuid.parse(categoryId);

  const patch: {
    nameEn?: string;
    nameAr?: string | null;
    isVisible?: boolean;
  } = {};

  if (changes.nameEn !== undefined) {
    const parsed = categoryInput
      .pick({ nameEn: true })
      .safeParse({ nameEn: changes.nameEn });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the form." };
    }
    patch.nameEn = parsed.data.nameEn;
  }
  if (changes.nameAr !== undefined) {
    patch.nameAr = changes.nameAr.trim() || null;
  }
  if (changes.isVisible !== undefined) {
    patch.isVisible = changes.isVisible;
  }

  const row = await withTenant(db, membership.tenantId, (session) =>
    createMenuRepository(session).updateCategory(id, patch),
  );
  if (!row) return { error: "That section no longer exists." };

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true };
}

export async function deleteCategory(
  tenantId: string,
  categoryId: string,
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));
  const id = uuid.parse(categoryId);

  const removed = await withTenant(db, membership.tenantId, async (session) => {
    const repo = createMenuRepository(session);
    // Counted BEFORE the delete: afterwards the rows are gone and any number
    // reported to the owner would be a guess. Sequential -- one transaction,
    // one connection.
    const dishes = await repo.countItemsInCategory(id);
    const row = await repo.deleteCategory(id);
    return row ? { name: row.nameEn, dishes } : null;
  });

  if (!removed) return { error: "That section no longer exists." };

  revalidatePath(`/${membership.tenantId}`);
  return {
    error: null,
    saved: true,
    message:
      removed.dishes === 0
        ? `Deleted ${removed.name}.`
        : `Deleted ${removed.name} and ${removed.dishes} ${
            removed.dishes === 1 ? "dish" : "dishes"
          }.`,
  };
}

export async function reorderCategories(
  tenantId: string,
  orderedIds: string[],
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));

  // Parsed as UUIDs, not merely as strings: an id reaching `WHERE id = $1`
  // that is not a UUID makes PostgreSQL raise a cast error rather than match
  // nothing, so this check is what turns a hostile list into a no-op.
  const parsed = uuidList.safeParse(orderedIds);
  if (!parsed.success) return { error: "That reorder was not understood." };

  await withTenant(db, membership.tenantId, (session) =>
    createMenuRepository(session).reorderCategories(parsed.data),
  );

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true };
}

/**
 * Price as typed by an owner: "12.50", "8", "350000".
 *
 * Deliberately stricter than the edit form's `z.coerce.number()`, which turns
 * an empty string into 0 and would silently create a free dish. A dish with no
 * price is the one thing quick-add must refuse.
 */
const priceInput = z
  .string()
  .trim()
  .min(1, "A dish needs a price.")
  .transform((value) => Number(value))
  .refine(
    (value) => Number.isFinite(value) && value >= 0,
    "Enter a price like 12.50.",
  );

const quickItemInput = z.object({
  nameEn: z.string().trim().min(1, "A dish needs a name."),
  price: priceInput,
});

export async function createItem(
  tenantId: string,
  categoryId: string,
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));
  const category = uuid.parse(categoryId);

  const parsed = quickItemInput.safeParse({
    nameEn: formData.get("nameEn"),
    price: formData.get("price"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const failure = await withTenant(db, membership.tenantId, async (session) => {
    const repo = createMenuRepository(session);

    /*
     * Tenant-scoped lookup before the insert, not merely for a nice error.
     *
     * `items.category_id` is a foreign key, and PostgreSQL evaluates foreign
     * key checks as the table owner, which bypasses RLS. Without this, someone
     * who guessed another restaurant's category UUID could park a row against
     * it -- invisible to both owners, and deleted out from under this one when
     * that category goes. Same containment reasoning as `imageId`.
     */
    const found = await repo.findCategory(category);
    if (!found) return "That section no longer exists.";

    const sortOrder = await repo.nextItemSortOrder(found.id);
    await repo.createItem({
      categoryId: found.id,
      nameEn: parsed.data.nameEn,
      basePriceMinor: toMinorUnits(parsed.data.price, membership.currency),
      sortOrder,
    });
    return null;
  });

  if (failure) return { error: failure };

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true };
}

export async function deleteItem(
  tenantId: string,
  itemId: string,
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));

  const removed = await withTenant(db, membership.tenantId, (session) =>
    createMenuRepository(session).deleteItem(uuid.parse(itemId)),
  );
  if (!removed) return { error: "That dish no longer exists." };

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true, message: `Deleted ${removed.nameEn}.` };
}

export async function reorderItems(
  tenantId: string,
  categoryId: string,
  orderedIds: string[],
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));
  const category = uuid.parse(categoryId);

  const parsed = uuidList.safeParse(orderedIds);
  if (!parsed.success) return { error: "That reorder was not understood." };

  await withTenant(db, membership.tenantId, (session) =>
    createMenuRepository(session).reorderItems(category, parsed.data),
  );

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true };
}

const variantInput = z.object({
  nameEn: z.string().trim().min(1, "A size needs a name."),
  nameAr: z.string().trim().optional(),
  price: priceInput,
});

export async function createVariant(
  tenantId: string,
  itemId: string,
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));
  const item = uuid.parse(itemId);

  const parsed = variantInput.safeParse({
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
    price: formData.get("price"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const failure = await withTenant(db, membership.tenantId, async (session) => {
    const repo = createMenuRepository(session);
    // Same foreign-key reasoning as createItem: item_id is checked as the
    // table owner, so RLS does not vet it. Look the dish up in tenant scope.
    const found = await repo.findItem(item);
    if (!found) return "That dish no longer exists.";

    const sortOrder = await repo.nextVariantSortOrder(found.id);
    await repo.createVariant({
      itemId: found.id,
      nameEn: parsed.data.nameEn,
      nameAr: parsed.data.nameAr || null,
      priceMinor: toMinorUnits(parsed.data.price, membership.currency),
      sortOrder,
    });
    return null;
  });

  if (failure) return { error: failure };

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true };
}

export async function updateVariant(
  tenantId: string,
  variantId: string,
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));

  const parsed = variantInput.safeParse({
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
    price: formData.get("price"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const row = await withTenant(db, membership.tenantId, (session) =>
    createMenuRepository(session).updateVariant(uuid.parse(variantId), {
      nameEn: parsed.data.nameEn,
      nameAr: parsed.data.nameAr || null,
      priceMinor: toMinorUnits(parsed.data.price, membership.currency),
    }),
  );
  if (!row) return { error: "That size no longer exists." };

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true };
}

export async function deleteVariant(
  tenantId: string,
  variantId: string,
): Promise<MenuActionState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));

  const removed = await withTenant(db, membership.tenantId, (session) =>
    createMenuRepository(session).deleteVariant(uuid.parse(variantId)),
  );
  if (!removed) return { error: "That size no longer exists." };

  revalidatePath(`/${membership.tenantId}`);
  return { error: null, saved: true };
}
