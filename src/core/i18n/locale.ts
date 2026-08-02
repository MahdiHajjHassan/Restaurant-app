export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export type Direction = "ltr" | "rtl";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * BCP 47 tag used for formatting.
 *
 * Arabic carries `-u-nu-latn` to force Latin digits. Menus in this market are
 * priced in Latin numerals even when the text is Arabic, and without this the
 * public site would show Arabic-Indic digits while the admin panel showed
 * Latin ones -- two different prices for the same item, as far as the owner is
 * concerned.
 */
export function formattingLocale(locale: Locale): string {
  return locale === "ar" ? "ar-u-nu-latn" : "en";
}

/**
 * Picks localized text, falling back to English.
 *
 * Owners fill in English first and get to Arabic later, if ever. A blank
 * Arabic field must render the English rather than an empty menu row -- the
 * fallback is the normal case, not an error path.
 */
export function localized(
  en: string,
  ar: string | null | undefined,
  locale: Locale,
): string {
  if (locale === "ar") {
    const trimmed = ar?.trim();
    if (trimmed) return trimmed;
  }
  return en;
}

/** Same fallback for optional fields, where both sides may be absent. */
export function localizedOptional(
  en: string | null | undefined,
  ar: string | null | undefined,
  locale: Locale,
): string | null {
  if (locale === "ar") {
    const trimmed = ar?.trim();
    if (trimmed) return trimmed;
  }
  return en?.trim() || null;
}
