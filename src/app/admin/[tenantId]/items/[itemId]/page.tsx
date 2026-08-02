import { notFound } from "next/navigation";
import { withTenant } from "@/core/db/tenant";
import { createMediaRepository } from "@/core/media/repository";
import { createMenuRepository } from "@/core/menu/repository";
import { toMajorUnits } from "@/core/money/format";
import { requireMembership } from "@/server/auth";
import { db } from "@/server/db";
import { ItemForm } from "./item-form";
import { PhotoField } from "./photo-field";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ tenantId: string; itemId: string }>;
}) {
  const { tenantId, itemId } = await params;
  const { membership } = await requireMembership(tenantId);

  const loaded = await withTenant(db, membership.tenantId, async (session) => {
    const repo = createMenuRepository(session);

    // Sequential: these share one transaction, and therefore one connection.
    const found = await repo.findItem(itemId);
    if (!found?.imageId) return { item: found, image: null };

    return {
      item: found,
      image: await createMediaRepository(session).findById(found.imageId),
    };
  });

  const { item, image } = loaded;

  // Tenant-scoped lookup, so an item belonging to another restaurant is simply
  // not found rather than forbidden.
  if (!item) notFound();

  return (
    <main className="py-6">
      <h1 className="font-display text-lg">{item.nameEn}</h1>

      <ItemForm
        tenantId={tenantId}
        itemId={item.id}
        currency={membership.currency}
        initial={{
          nameEn: item.nameEn,
          nameAr: item.nameAr ?? "",
          descriptionEn: item.descriptionEn ?? "",
          descriptionAr: item.descriptionAr ?? "",
          price: String(
            toMajorUnits(item.basePriceMinor, membership.currency),
          ),
        }}
      />

      <PhotoField
        tenantId={tenantId}
        itemId={item.id}
        dishName={item.nameEn}
        currentImage={
          image
            ? { storageKey: image.storageKey, blurDataUrl: image.blurDataUrl }
            : null
        }
      />
    </main>
  );
}
