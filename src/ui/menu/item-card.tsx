import Image from "next/image";
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
  /**
   * How this card's photo should be fetched.
   *
   * next/image lazy-loads by default, which is right for the eighty-odd dishes
   * below the fold and wrong for the six above it: measured on a 375px screen,
   * every photo in the opening viewport was `loading="lazy"` with no preload,
   * so the largest paint waited on a scroll that had already happened. That
   * alone held a 90-dish grid at 83.
   *
   * - "lcp"    the first row, which is where the largest paint actually lands:
   *            preloaded and fetched at high priority.
   * - "eager"  the rest of the opening viewport: fetched immediately, but at
   *            normal priority so it does not compete with the LCP image.
   * - "lazy"   everything below the fold, which is most of the menu.
   */
  fetch?: "lcp" | "eager" | "lazy";
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
export function ItemCard({
  item,
  currency,
  locale,
  variant,
  fetch = "lazy",
}: ItemCardProps) {
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
      {item.image ? (
        <div
          className={`relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-md bg-[var(--color-paper-sunk)] ${
            // A full-colour photo beside struck-through text reads as a
            // rendering bug, so the photo dims with the dish.
            soldOut ? "opacity-60 grayscale" : ""
          }`}
        >
          <Image
            src={`/storage/${item.image.storageKey}`}
            /*
             * Empty alt on purpose: the dish name sits directly beneath this
             * image, so describing it again is noise for a screen reader.
             */
            alt=""
            fill
            sizes={
              variant === "grid"
                ? "(max-width: 640px) 50vw, 33vw"
                : "(max-width: 768px) 100vw, 42rem"
            }
            placeholder={item.image.blurDataUrl ? "blur" : "empty"}
            blurDataURL={item.image.blurDataUrl ?? undefined}
            /*
             * `priority` emits the <link rel="preload">, and it is reserved for
             * the first row: handing it to every visible card would put six
             * preloads in front of the one paint the score is measured on.
             *
             * fetchPriority is set explicitly rather than left to `priority`.
             * Next 16 emits neither fetchpriority="high" on the img nor on the
             * preload link, and Lighthouse's LCP-discovery check wants all
             * three -- eager, discoverable, AND high priority -- so it kept
             * scoring zero on a page that already had the first two.
             */
            priority={fetch === "lcp"}
            fetchPriority={fetch === "lcp" ? "high" : undefined}
            loading={fetch === "lazy" ? "lazy" : "eager"}
            className="object-cover"
          />
        </div>
      ) : (
        /*
         * No photo is not an error. Most restaurants photograph part of their
         * menu and never finish, so the gap has to look deliberate -- a flat
         * surface, not an empty frame with a broken-image icon.
         */
        <div
          className={`mb-2 aspect-[4/3] w-full rounded-md bg-[var(--color-paper-sunk)] ${
            soldOut ? "opacity-60" : ""
          }`}
          aria-hidden="true"
        />
      )}

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
