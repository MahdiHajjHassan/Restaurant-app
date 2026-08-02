"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/core/db/tenant";
import { createMenuRepository } from "@/core/menu/repository";
import { requireMembership } from "@/server/auth";
import { db } from "@/server/db";
import { storeUpload } from "@/server/media";

const uuid = z.string().uuid();

export interface PhotoFormState {
  error: string | null;
  saved?: boolean;
}

/**
 * Attach a photo to a dish.
 *
 * requireMembership runs here rather than relying on the layout: an action can
 * be invoked directly, and tenantId arrives from the client.
 */
export async function uploadItemPhoto(
  tenantId: string,
  itemId: string,
  _previous: PhotoFormState,
  formData: FormData,
): Promise<PhotoFormState> {
  const { membership } = await requireMembership(uuid.parse(tenantId));

  /*
   * Removal travels through the same action, and therefore the same form
   * submission, as upload. Calling a server action from an onClick handler
   * instead leaves the page waiting on revalidatePath to trigger a re-render,
   * which is timing-dependent -- the owner taps "Remove" and the photo stays on
   * screen until something else happens to refresh it.
   */
  if (formData.get("remove") === "true") {
    await withTenant(db, membership.tenantId, (session) =>
      createMenuRepository(session).updateItem(uuid.parse(itemId), {
        imageId: null,
      }),
    );

    revalidatePath(`/${membership.tenantId}`);
    revalidatePath(`/${membership.tenantId}/items/${itemId}`);
    return { error: null, saved: true };
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo first." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const stored = await storeUpload(membership.tenantId, bytes);
  if (!stored.ok) {
    // storeUpload's reasons are written for an owner holding a phone, so they
    // are surfaced verbatim rather than replaced with a generic failure.
    return { error: stored.reason };
  }

  /*
   * The media row is written under the tenant session, and so is this update.
   * Setting imageId through the tenant-scoped repository means a caller cannot
   * attach one restaurant's photo to another's dish even by guessing ids.
   */
  const updated = await withTenant(db, membership.tenantId, (session) =>
    createMenuRepository(session).updateItem(uuid.parse(itemId), {
      imageId: stored.mediaId,
    }),
  );

  if (!updated) return { error: "That dish no longer exists." };

  revalidatePath(`/${membership.tenantId}`);
  revalidatePath(`/${membership.tenantId}/items/${itemId}`);
  return { error: null, saved: true };
}

