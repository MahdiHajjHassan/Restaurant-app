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
