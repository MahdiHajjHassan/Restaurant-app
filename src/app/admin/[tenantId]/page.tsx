import Link from "next/link";
import { formatMoney } from "@/core/money/format";
import { requireMembership } from "@/server/auth";
import { getAdminMenu } from "@/server/admin";
import { AddCategory } from "./add-category";
import { AvailabilityToggle } from "./availability-toggle";
import { CategoryHeader } from "./category-header";
import { ItemRowControls } from "./item-row-controls";
import { QuickAddItem } from "./quick-add-item";

export default async function MenuAdminPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const { membership } = await requireMembership(tenantId);
  const menu = await getAdminMenu(membership.tenantId);

  // Computed once and handed down: every move control needs the full ordered
  // list of its siblings, because reordering sends the whole order rather than
  // a delta.
  const categoryIds = menu.map((category) => category.id);

  if (menu.length === 0) {
    return (
      <main className="py-10">
        <h1 className="font-display text-lg">Let&rsquo;s build your menu</h1>
        <p className="mt-2 max-w-prose text-[0.85rem] text-[var(--color-muted)]">
          Start with a section — Starters, Grills, Drinks — then add dishes to
          it. Nothing shows on your site until a section has a dish in it, so
          you can build it in any order.
        </p>
        <AddCategory tenantId={tenantId} />
      </main>
    );
  }

  return (
    <main className="py-6">
      <p className="text-[0.8rem] text-[var(--color-muted)]">
        Type a dish name and price, then press Enter. Tap a dish to add a photo,
        an Arabic name or sizes. Changes show on your site immediately.
      </p>

      {menu.map((category) => {
        const itemIds = category.items.map((item) => item.id);

        return (
          <section key={category.id} className="mt-8">
            <CategoryHeader
              tenantId={tenantId}
              categoryId={category.id}
              nameEn={category.nameEn}
              nameAr={category.nameAr}
              isVisible={category.isVisible}
              itemCount={category.items.length}
              orderedIds={categoryIds}
            />

            {category.items.length === 0 ? (
              <p className="mt-2 text-[0.8rem] text-[var(--color-muted)]">
                No dishes here yet. This section stays off your site until it
                has one.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--color-rule)]">
                {category.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
                  >
                    <Link
                      href={`/${tenantId}/items/${item.id}`}
                      className="min-w-0 flex-1"
                    >
                      <span
                        className={`block truncate text-[0.95rem] ${
                          item.isAvailable
                            ? ""
                            : "text-[var(--color-muted)] line-through"
                        }`}
                      >
                        {item.nameEn}
                      </span>
                      {item.nameAr ? (
                        <span className="block truncate text-[0.8rem] text-[var(--color-muted)]">
                          {item.nameAr}
                        </span>
                      ) : (
                        // Named as a gap to fill, not as an error: Arabic is
                        // optional and falls back to English on the site.
                        <span className="block text-[0.75rem] text-[var(--color-muted)]">
                          No Arabic name
                        </span>
                      )}
                    </Link>

                    <span className="price shrink-0 text-[0.9rem]">
                      {formatMoney(
                        item.basePriceMinor,
                        membership.currency,
                        "en",
                      )}
                    </span>

                    <AvailabilityToggle
                      tenantId={tenantId}
                      itemId={item.id}
                      itemName={item.nameEn}
                      isAvailable={item.isAvailable}
                    />

                    <ItemRowControls
                      tenantId={tenantId}
                      categoryId={category.id}
                      itemId={item.id}
                      itemName={item.nameEn}
                      orderedIds={itemIds}
                    />
                  </li>
                ))}
              </ul>
            )}

            <QuickAddItem
              tenantId={tenantId}
              categoryId={category.id}
              categoryName={category.nameEn}
              currency={membership.currency}
            />
          </section>
        );
      })}

      <section className="mt-10 border-t border-[var(--color-rule)] pt-4">
        <AddCategory tenantId={tenantId} />
      </section>
    </main>
  );
}
