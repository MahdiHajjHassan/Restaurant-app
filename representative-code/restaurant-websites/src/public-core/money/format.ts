import { formattingLocale, type Locale } from "../i18n/locale";

/**
 * Money formatting.
 *
 * Prices are stored as integer minor units. Converting to a display string
 * needs the currency's exponent -- USD has 2 decimal places, LBP and JPY have
 * 0 -- and that exponent must come FROM the currency, never be hardcoded.
 * Hardcoding 2 renders 350000 LBP as "3,500.00", which is wrong by two orders
 * of magnitude and looks plausible enough to ship.
 */

/**
 * Intl.NumberFormat construction is genuinely expensive and menu pages format
 * a price per row. Building one per item made this measurable on a 90-item
 * menu, so instances are cached per locale+currency.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: Locale, currency: string): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  const cached = formatters.get(key);
  if (cached) return cached;

  const created = new Intl.NumberFormat(formattingLocale(locale), {
    style: "currency",
    currency,
  });
  formatters.set(key, created);
  return created;
}

const exponents = new Map<string, number>();

/**
 * The currency's minor-unit exponent, taken from ICU's own currency data
 * rather than a lookup table we would have to maintain.
 */
export function currencyExponent(currency: string): number {
  const cached = exponents.get(currency);
  if (cached !== undefined) return cached;

  const resolved = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions();

  const exponent = resolved.maximumFractionDigits ?? 2;
  exponents.set(currency, exponent);
  return exponent;
}

/** Minor units to a major-unit number. 1250 USD-minor -> 12.5 */
export function toMajorUnits(minorUnits: number, currency: string): number {
  return minorUnits / 10 ** currencyExponent(currency);
}

/** Major units to minor. Rounds, because 12.505 * 100 is 1250.4999999999998. */
export function toMinorUnits(majorUnits: number, currency: string): number {
  return Math.round(majorUnits * 10 ** currencyExponent(currency));
}

/**
 * Formats stored minor units for display.
 *
 * @param minorUnits stored integer amount, e.g. 1250
 * @param currency   ISO 4217 code from the tenant, e.g. "USD"
 */
export function formatMoney(
  minorUnits: number,
  currency: string,
  locale: Locale,
): string {
  return formatterFor(locale, currency).format(
    toMajorUnits(minorUnits, currency),
  );
}
