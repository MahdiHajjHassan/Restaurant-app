import type { Locale } from "@/core/i18n/locale";
import { localized, localizedOptional } from "@/core/i18n/locale";
import { getMessages } from "@/core/i18n/messages";
import type { MenuItem } from "@/core/menu/repository";
import { formatMoney } from "@/core/money/format";

interface ItemCardProps {
  item: MenuItem;
  currency: string;
  locale: Locale;
  /** Editorial runs one wide column; grid runs a tighter card. */
  variant: "grid" | "editorial";
}

/**
 * One dish, photo-forward.
 *
 * Degrades honestly: an item with no photo renders as name and price on a flat
 * surface rather than an empty frame. Most restaurants photograph part of their
 * menu and never finish, so a half-photographed grid has to look deliberate
 * instead of broken -- that is the difference between a preset a real client
 * can use and one that only survives a demo.
 *
 * Carries the same data-item / data-search attributes as ItemRow so the
 * existing client-side search keeps working across every preset.
 */
export function ItemCard({ item, currency, locale, variant }: ItemCardProps) {
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
    <li data-item data-search={searchText} className="flex flex-col">
      {/*
        Photo slot. A dish without one gets a flat surface rather than a broken
        frame -- see the component note above.
      */}
      <div
        className={`mb-2 aspect-[4/3] w-full rounded-md bg-[var(--color-paper-sunk)] ${
          soldOut ? "opacity-60 grayscale" : ""
        }`}
        aria-hidden="true"
      />

      <div className="flex items-baseline gap-2">
        <h3
          className={`text-[0.95rem] font-medium ${
            soldOut ? "text-[var(--color-muted)] line-through" : ""
          }`}
        >
          {name}
        </h3>

        <span className="leader" aria-hidden="true" />

        <span
          className={`price text-[0.95rem] ${
            soldOut ? "text-[var(--color-muted)] line-through" : "font-medium"
          }`}
        >
          {formatMoney(item.basePriceMinor, currency, locale)}
        </span>
      </div>

      {description ? (
        <p
          className={`mt-1 text-[0.8rem] leading-relaxed text-[var(--color-muted)] ${
            variant === "grid" ? "line-clamp-2" : ""
          }`}
        >
          {description}
        </p>
      ) : null}

      {item.variants.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.78rem] text-[var(--color-muted)]">
          {item.variants.map((itemVariant) => (
            <li key={itemVariant.id}>
              {localized(itemVariant.nameEn, itemVariant.nameAr, locale)}{" "}
              <span className="price text-[var(--color-ink)]">
                {formatMoney(itemVariant.priceMinor, currency, locale)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-2 empty:mt-0">
        {/*
          Sold out stays on the menu, struck through, the way a server crosses a
          dish off a board -- identical to the list preset, so the treatment
          does not change meaning when an owner switches layout.
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
