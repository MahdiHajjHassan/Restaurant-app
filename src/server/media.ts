import { randomUUID } from "node:crypto";
import { withTenant } from "@/core/db/tenant";
import { processImage } from "@/core/media/process";
import { createMediaRepository } from "@/core/media/repository";
import { validateUpload } from "@/core/media/validate";
import { tenantScopedKey } from "@/core/storage/types";
import { db } from "./db";
import { storage } from "./storage";

export type StoreUploadResult =
  | { ok: true; mediaId: string }
  | { ok: false; reason: string };

/**
 * Validate, normalise, store, and record one owner-uploaded photo.
 *
 * Validation runs on the BYTES before sharp ever sees them: decoding untrusted
 * input is the reachable attack surface that the libvips CVE pin in
 * package.json exists for, so the cheap magic-byte check goes first.
 *
 * The object is written to storage before the row is inserted. That ordering
 * can leave an orphaned object if the insert fails, which is recoverable; the
 * reverse leaves a row pointing at nothing, which renders a broken image on a
 * customer-facing menu.
 */
export async function storeUpload(
  tenantId: string,
  bytes: Uint8Array,
): Promise<StoreUploadResult> {
  const validation = validateUpload(bytes);
  if (!validation.ok) return { ok: false, reason: validation.reason };

  let processed;
  try {
    processed = await processImage(bytes);
  } catch {
    // The magic bytes matched but libvips could not decode it -- a truncated or
    // corrupt file. The owner needs an action, not a stack trace.
    return {
      ok: false,
      reason: "That photo could not be read. Try taking or choosing it again.",
    };
  }

  const key = tenantScopedKey(tenantId, "media", `${randomUUID()}.webp`);

  await storage.put(key, processed.data, {
    contentType: processed.contentType,
  });

  return withTenant(db, tenantId, async (session) => {
    const row = await createMediaRepository(session).insert({
      storageKey: key,
      contentType: processed.contentType,
      byteSize: processed.data.byteLength,
      width: processed.width,
      height: processed.height,
      blurDataUrl: processed.blurDataUrl,
    });

    return { ok: true, mediaId: row.id };
  });
}
