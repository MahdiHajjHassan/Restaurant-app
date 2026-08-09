import Link from "next/link";
import { formatMoney } from "@/core/money/format";
import { requireMembership } from "@/server/auth";
import { getAdminMenu } from "@/server/admin";
import { EmptyState, PageHeader } from "@/ui/console";
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
      <main className="py-8">
        <EmptyState
          title="Let’s build your menu"
          description="Start with a section — Starters, Grills, Drinks — then add dishes to it. Nothing shows on your site until a section has a dish in it, so you can build it in any order."
        />
        <div className="mt-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 sm:p-5">
          <AddCategory tenantId={tenantId} />
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        title="Menu"
        description="Type a dish name and price, then press Enter. Tap a dish to add a photo, an Arabic name or sizes. Changes show on your site immediately."
      />

      <div className="flex flex-col gap-4">
        {menu.map((category) => {
          const itemIds = category.items.map((item) => item.id);

          return (
            /*
             * One panel per section, with a spine that reports whether the
             * section is on the site. A hidden section is the owner's choice
             * rather than a fault, so it is muted rather than red -- but it
             * must be obvious, because "why isn't this showing" is the support
             * call this screen exists to prevent.
             */
            <section
              key={category.id}
              className={`spine ${
                category.isVisible ? "spine-ok" : "spine-muted"
              } overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]`}
            >
              <div className="border-b border-[var(--c-border)] px-3 py-2.5 sm:px-4">
                <CategoryHeader
                  tenantId={tenantId}
                  categoryId={category.id}
                  nameEn={category.nameEn}
                  nameAr={category.nameAr}
                  isVisible={category.isVisible}
                  itemCount={category.items.length}
                  orderedIds={categoryIds}
                />
              </div>

              {category.items.length === 0 ? (
                <p className="px-4 pt-4 text-[0.825rem] text-[var(--c-text-muted)]">
                  No dishes here yet. This section stays off your site until it
                  has one.
                </p>
              ) : (
                <ul>
                  {category.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--c-border)] px-3 py-2 last:border-b-0 hover:bg-[var(--c-surface-sunk)] sm:px-4"
                    >
                      <Link
                        href={`/${tenantId}/items/${item.id}`}
                        /*
                         * basis-full on a phone: sharing one line with the
                         * price, the sold-out toggle and four controls crushed
                         * the dish name to a single character. The name is the
                         * thing an owner is looking for, so it gets the row.
                         */
                        className="flex min-h-11 min-w-0 flex-1 basis-full flex-col justify-center py-1 sm:basis-auto"
                      >
                        <span
                          className={`block truncate text-[0.95rem] font-medium ${
                            item.isAvailable
                              ? ""
                              : "text-[var(--c-text-subtle)] line-through"
                          }`}
                        >
                          {item.nameEn}
                        </span>
                        {item.nameAr ? (
                          <span className="block truncate text-[0.8rem] text-[var(--c-text-muted)]">
                            {item.nameAr}
                          </span>
                        ) : (
                          // Named as a gap to fill, not as an error: Arabic is
                          // optional and falls back to English on the site.
                          <span className="block text-[0.75rem] text-[var(--c-text-subtle)]">
                            No Arabic name
                          </span>
                        )}
                      </Link>

                      <span className="price shrink-0 text-[0.9rem] font-semibold tabular-nums">
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

              {/*
                The quick-add row sits in a sunk well at the foot of its
                section, so it reads as an invitation to type rather than as
                one more dish. It is the most used control in the product.
              */}
              <div className="bg-[var(--c-surface-sunk)] px-3 py-3 sm:px-4">
                <QuickAddItem
                  tenantId={tenantId}
                  categoryId={category.id}
                  categoryName={category.nameEn}
                  currency={membership.currency}
                />
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-6 rounded-xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-4 sm:p-5">
        <AddCategory tenantId={tenantId} />
      </section>
    </main>
  );
}
