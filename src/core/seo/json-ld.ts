import type { ContactSettings } from "../contact/repository";
import type { HourSegment } from "../contact/hours";
import { localized, localizedOptional, type Locale } from "../i18n/locale";
import type { MenuCategory } from "../menu/repository";
import { toMajorUnits } from "../money/format";

/** schema.org uses two-letter day codes, indexed here by JS day number. */
const SCHEMA_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

interface RestaurantSchemaInput {
  name: string;
  url: string;
  currency: string;
  locale: Locale;
  menu: readonly MenuCategory[];
  contact: ContactSettings | null;
  hours: readonly HourSegment[];
}

/**
 * schema.org Restaurant + Menu markup.
 *
 * This is a large part of what a restaurant is actually buying: structured
 * data is how Google renders opening hours, a phone number, and menu items
 * directly in search results. Emitting it correctly is worth more to a small
 * restaurant than any amount of visual polish.
 */
export function buildRestaurantSchema({
  name,
  url,
  currency,
  locale,
  menu,
  contact,
  hours,
}: RestaurantSchemaInput): Record<string, unknown> {
  const address = contact
    ? localizedOptional(contact.addressEn, contact.addressAr, locale)
    : null;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name,
    url,
  };

  if (address) {
    schema.address = { "@type": "PostalAddress", streetAddress: address };
  }
  if (contact?.phone) schema.telephone = contact.phone;
  if (contact?.latitude && contact.longitude) {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: contact.latitude,
      longitude: contact.longitude,
    };
  }

  if (hours.length > 0) {
    schema.openingHoursSpecification = hours.map((segment) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: SCHEMA_DAYS[segment.dayOfWeek],
      opens: segment.opensAt.slice(0, 5),
      closes: segment.closesAt.slice(0, 5),
    }));
  }

  if (menu.length > 0) {
    schema.hasMenu = {
      "@type": "Menu",
      hasMenuSection: menu.map((category) => ({
        "@type": "MenuSection",
        name: localized(category.nameEn, category.nameAr, locale),
        hasMenuItem: category.items.map((item) => {
          const entry: Record<string, unknown> = {
            "@type": "MenuItem",
            name: localized(item.nameEn, item.nameAr, locale),
            offers: {
              "@type": "Offer",
              price: toMajorUnits(item.basePriceMinor, currency),
              priceCurrency: currency,
              // Sold-out items stay listed but must not be advertised as
              // available, or search results promise a dish that is off.
              availability: item.isAvailable
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            },
          };

          const description = localizedOptional(
            item.descriptionEn,
            item.descriptionAr,
            locale,
          );
          if (description) entry.description = description;

          return entry;
        }),
      })),
    };
  }

  return schema;
}
