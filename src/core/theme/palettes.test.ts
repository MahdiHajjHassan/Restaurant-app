import { describe, expect, it } from "vitest";
import { validatePalette } from "./contrast";
import { DEFAULT_PALETTE_ID, isPaletteId, PALETTES } from "./palettes";
import { DEFAULT_FONT_PAIR, FONT_PAIRS, isFontPairId } from "./fonts";
import { isHexColor, THEME_TOKENS } from "./tokens";

describe("curated palettes", () => {
  /*
   * A shipped palette that the editor would refuse to save is a contradiction
   * the owner experiences as a broken product. This test is the reason the
   * palettes can be trusted without hand-checking arithmetic.
   */
  it.each(Object.keys(PALETTES))("%s passes its own contrast rules", (id) => {
    const issues = validatePalette(PALETTES[id as keyof typeof PALETTES]);
    const blocking = issues.filter((i) => i.severity === "block");
    expect(blocking).toEqual([]);
  });

  it.each(Object.keys(PALETTES))("%s defines every token as valid hex", (id) => {
    const palette = PALETTES[id as keyof typeof PALETTES];
    for (const token of THEME_TOKENS) {
      expect(isHexColor(palette[token])).toBe(true);
    }
  });

  it("has a default that exists", () => {
    expect(PALETTES[DEFAULT_PALETTE_ID]).toBeDefined();
  });

  it("guards palette ids", () => {
    expect(isPaletteId("crimson")).toBe(true);
    expect(isPaletteId("chartreuse")).toBe(false);
    expect(isPaletteId(null)).toBe(false);
  });
});

describe("font pairings", () => {
  /*
   * Every pairing must include a genuine Arabic face -- a Latin family with
   * Arabic bolted on renders Arabic menus badly, and Arabic is a first-class
   * language here, not a translation layer.
   */
  it.each(Object.keys(FONT_PAIRS))(
    "%s declares an Arabic-capable body",
    (id) => {
      expect(FONT_PAIRS[id as keyof typeof FONT_PAIRS].arabicReady).toBe(true);
    },
  );

  /*
   * The body face renders the price column, which needs true tabular figures or
   * prices jitter in width and stop being scannable down the page.
   */
  it.each(Object.keys(FONT_PAIRS))("%s uses the tabular body face", (id) => {
    expect(FONT_PAIRS[id as keyof typeof FONT_PAIRS].bodyVariable).toBe(
      "--font-plex-arabic",
    );
  });

  it("has a default that exists", () => {
    expect(FONT_PAIRS[DEFAULT_FONT_PAIR]).toBeDefined();
    expect(isFontPairId("modern")).toBe(true);
    expect(isFontPairId("comic")).toBe(false);
  });
});
