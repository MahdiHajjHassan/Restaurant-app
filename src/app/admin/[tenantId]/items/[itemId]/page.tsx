import Link from "next/link";
import { notFound } from "next/navigation";
import { withTenant } from "@/core/db/tenant";
import { createMediaRepository } from "@/core/media/repository";
import { createMenuRepository } from "@/core/menu/repository";
import { toMajorUnits } from "@/core/money/format";
import { requireMembership } from "@/server/auth";
import { db } from "@/server/db";
import { PageHeader } from "@/ui/console";
import { ItemForm } from "./item-form";
import { PhotoField } from "./photo-field";
import { VariantsSection } from "./variants-section";

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
    if (!found) return { item: null, image: null, variants: [] };

    const variants = await repo.listVariants(found.id);
    if (!found.imageId) return { item: found, image: null, variants };

    return {
      item: found,
      image: await createMediaRepository(session).findById(found.imageId),
      variants,
    };
  });

  const { item, image, variants } = loaded;

  // Tenant-scoped lookup, so an item belonging to another restaurant is simply
  // not found rather than forbidden.
  if (!item) notFound();

  return (
    <main>
      <Link
        href={`/${tenantId}`}
        className="mt-6 inline-block text-[0.825rem] font-medium text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
      >
        ← Back to the menu
      </Link>

      <PageHeader title={item.nameEn} />

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

      <VariantsSection
        tenantId={tenantId}
        itemId={item.id}
        currency={membership.currency}
        variants={variants.map((variant) => ({
          id: variant.id,
          nameEn: variant.nameEn,
          nameAr: variant.nameAr ?? "",
          price: String(toMajorUnits(variant.priceMinor, membership.currency)),
        }))}
      />
    </main>
  );
}
