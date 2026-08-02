import Link from "next/link";
import { formatMoney } from "@/core/money/format";
import { requireMembership } from "@/server/auth";
import { getAdminMenu } from "@/server/admin";
import { AvailabilityToggle } from "./availability-toggle";

export default async function MenuAdminPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const { membership } = await requireMembership(tenantId);
  const menu = await getAdminMenu(membership.tenantId);

  const itemCount = menu.reduce(
    (total, category) => total + category.items.length,
    0,
  );

  if (itemCount === 0) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-2 py-16 text-center">
        <h1 className="font-display text-lg">No dishes yet</h1>
        <p className="text-[0.85rem] text-[var(--color-muted)]">
          Add your first category and dish to start building the menu.
        </p>
      </main>
    );
  }

  return (
    <main className="py-6">
      <p className="text-[0.8rem] text-[var(--color-muted)]">
        Tap a dish to edit it, or mark it sold out. Changes show on your site
        immediately.
      </p>

      {menu.map((category) => (
        <section key={category.id} className="mt-7">
          <h2 className="flex items-baseline gap-2 font-display text-base">
            {category.nameEn}
            {!category.isVisible ? (
              <span className="rounded-sm border border-[var(--color-rule)] px-1.5 py-0.5 text-[0.65rem] tracking-wide text-[var(--color-muted)] uppercase">
                Hidden
              </span>
            ) : null}
          </h2>

          <ul className="mt-2 divide-y divide-[var(--color-rule)]">
            {category.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 py-2.5"
              >
                <Link
                  href={`/${tenantId}/items/${item.id}`}
                  className="min-w-0 flex-1"
                >
                  <span
                    className={`block truncate text-[0.95rem] ${
                      item.isAvailable ? "" : "text-[var(--color-muted)] line-through"
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
                  {formatMoney(item.basePriceMinor, membership.currency, "en")}
                </span>

                <AvailabilityToggle
                  tenantId={tenantId}
                  itemId={item.id}
                  itemName={item.nameEn}
                  isAvailable={item.isAvailable}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
