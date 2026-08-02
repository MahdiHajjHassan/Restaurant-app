import { describe, expect, it } from "vitest";
import {
  currencyExponent,
  formatMoney,
  toMajorUnits,
  toMinorUnits,
} from "./format";

describe("currencyExponent", () => {
  // Taken from ICU's currency data rather than a table we would have to keep
  // up to date. Hardcoding 2 is what renders 350000 LBP as "3,500.00".
  it.each([
    ["USD", 2],
    ["EUR", 2],
    ["LBP", 0],
    ["JPY", 0],
    ["KWD", 3],
  ])("%s has %i decimal places", (currency, expected) => {
    expect(currencyExponent(currency)).toBe(expected);
  });
});

describe("formatMoney", () => {
  it("formats a two-decimal currency", () => {
    expect(formatMoney(1250, "USD", "en")).toBe("$12.50");
  });

  it("formats a zero-decimal currency without inventing decimals", () => {
    const formatted = formatMoney(350_000, "LBP", "en");

    expect(formatted).toContain("350,000");
    // The bug this guards: treating every currency as 2dp would show 3,500.00,
    // wrong by two orders of magnitude and plausible enough to ship.
    expect(formatted).not.toContain("3,500.00");
    expect(formatted).not.toContain(".00");
  });

  it("uses Latin digits in Arabic", () => {
    const formatted = formatMoney(1250, "USD", "ar");

    expect(formatted).toContain("12.50");
    // Arabic-Indic digits would mean the owner sees one price in the admin and
    // a different-looking one on their site.
    expect(formatted).not.toMatch(/[٠-٩۰-۹]/);
  });

  it("formats zero", () => {
    expect(formatMoney(0, "USD", "en")).toBe("$0.00");
  });

  it("groups large amounts", () => {
    expect(formatMoney(123_456_789, "USD", "en")).toBe("$1,234,567.89");
  });
});

describe("unit conversion", () => {
  it.each([
    [1250, "USD", 12.5],
    [350_000, "LBP", 350_000],
    [1234, "KWD", 1.234],
  ])("converts %i %s minor units to %f major", (minor, currency, expected) => {
    expect(toMajorUnits(minor, currency)).toBe(expected);
  });

  it("rounds when converting to minor units", () => {
    // 12.34 * 100 is 1233.9999999999998 in IEEE 754. Truncating would lose a
    // cent on a large share of prices.
    expect(toMinorUnits(12.34, "USD")).toBe(1234);
    expect(toMinorUnits(0.07, "USD")).toBe(7);
    expect(toMinorUnits(350_000, "LBP")).toBe(350_000);
  });

  it("round-trips", () => {
    for (const minor of [0, 1, 99, 1250, 999_999]) {
      expect(toMinorUnits(toMajorUnits(minor, "USD"), "USD")).toBe(minor);
    }
  });
});
