import type { Locale } from "@/core/i18n/locale";
import { localized, localizedOptional } from "@/core/i18n/locale";
import { getMessages } from "@/core/i18n/messages";
import type { MenuItem } from "@/core/menu/repository";
import { formatMoney } from "@/core/money/format";

interface ItemRowProps {
  item: MenuItem;
  currency: string;
  locale: Locale;
}

/**
 * One dish.
 *
 * The name, a leader rule, and the price on one baseline -- the typographic
 * convention every printed menu uses, and the reason this scans faster than a
 * card grid. `data-search` carries both languages so filtering finds a dish
 * whichever one the customer types.
 */
export function ItemRow({ item, currency, locale }: ItemRowProps) {
  const messages = getMessages(locale);
  const name = localized(item.nameEn, item.nameAr, locale);
  const description = localizedOptional(
    item.descriptionEn,
    item.descriptionAr,
    locale,
  );

  const soldOut = !item.isAvailable;

  // Both languages plus the description, so search works across scripts.
  const searchText = [
    item.nameEn,
    item.nameAr,
    item.descriptionEn,
    item.descriptionAr,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    <li
      data-item
      data-search={searchText}
      className="py-3.5 first:pt-0 last:pb-0"
    >
      <div className="flex items-baseline gap-2">
        <h3
          className={`text-[0.975rem] font-medium ${
            soldOut ? "text-[var(--color-muted)] line-through" : ""
          }`}
        >
          {name}
        </h3>

        <span className="leader" aria-hidden="true" />

        <span
          className={`price text-[0.975rem] ${
            soldOut
              ? "text-[var(--color-muted)] line-through"
              : "font-medium"
          }`}
        >
          {formatMoney(item.basePriceMinor, currency, locale)}
        </span>
      </div>

      {description ? (
        <p className="mt-1 max-w-prose text-[0.85rem] leading-relaxed text-[var(--color-muted)]">
          {description}
        </p>
      ) : null}

      {item.variants.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.8rem] text-[var(--color-muted)]">
          {item.variants.map((variant) => (
            <li key={variant.id}>
              {localized(variant.nameEn, variant.nameAr, locale)}{" "}
              <span className="price text-[var(--color-ink)]">
                {formatMoney(variant.priceMinor, currency, locale)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-2 empty:mt-0">
        {/*
          Sold out stays on the menu, struck through, the way a server crosses a
          dish off a board. Removing it would tell the customer the dish does
          not exist, and it is the control owners touch daily -- one tap back.
        */}
        {soldOut ? (
          <span className="rounded-sm border border-[var(--color-rule)] px-1.5 py-0.5 text-[0.7rem] tracking-wide text-[var(--color-muted)] uppercase">
            {messages.soldOut}
          </span>
        ) : null}

        {item.badges.map((badge) => (
          <span
            key={badge}
            className="text-[0.7rem] tracking-wide text-[var(--color-accent)] uppercase"
          >
            {messages.badges[badge] ?? badge}
          </span>
        ))}
      </div>
    </li>
  );
}
