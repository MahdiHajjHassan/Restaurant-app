import { describe, expect, it } from "vitest";
import { PALETTES } from "./palettes";
import { InvalidThemeError, resolveTheme, themeCssVariables } from "./resolve";

describe("resolveTheme", () => {
  it("falls back to the platform default when nothing is stored", () => {
    const theme = resolveTheme({
      paletteId: null,
      overrides: null,
      fontPair: null,
      preset: null,
    });
    expect(theme.paletteId).toBe("paper");
    expect(theme.palette).toEqual(PALETTES.paper);
    expect(theme.fontPair).toBe("classic");
    expect(theme.preset).toBe("list");
  });

  it("applies a curated palette by id", () => {
    const theme = resolveTheme({
      paletteId: "crimson",
      overrides: null,
      fontPair: null,
      preset: null,
    });
    expect(theme.palette).toEqual(PALETTES.crimson);
  });

  /*
   * Overrides are sparse on purpose. An owner who changed only their accent
   * keeps that change and still inherits any future improvement to the rest of
   * the curated palette. Storing a full resolved palette would freeze every
   * client on the palette as it looked the day they signed up.
   */
  it("layers sparse overrides over the curated palette", () => {
    const theme = resolveTheme({
      paletteId: "crimson",
      overrides: { accent: "#123456" },
      fontPair: null,
      preset: null,
    });
    expect(theme.palette.accent).toBe("#123456");
    expect(theme.palette.paper).toBe(PALETTES.crimson.paper);
    expect(theme.palette.ink).toBe(PALETTES.crimson.ink);
  });

  // jsonb round-trips arbitrary data; anything unrecognised is discarded rather
  // than trusted, because these values end up in CSS.
  it("discards unknown keys and invalid colours from stored overrides", () => {
    const theme = resolveTheme({
      paletteId: "paper",
      overrides: { accent: "red", bogus: "#000000", ink: "#111111" },
      fontPair: null,
      preset: null,
    });
    expect(theme.palette.accent).toBe(PALETTES.paper.accent);
    expect(theme.palette.ink).toBe("#111111");
    expect(theme.palette).not.toHaveProperty("bogus");
  });

  it("falls back on an unrecognised palette id, font pair, or preset", () => {
    const theme = resolveTheme({
      paletteId: "chartreuse",
      overrides: null,
      fontPair: "comic",
      preset: "carousel",
    });
    expect(theme.paletteId).toBe("paper");
    expect(theme.fontPair).toBe("classic");
    expect(theme.preset).toBe("list");
  });
});

describe("themeCssVariables", () => {
  it("emits one custom property per token", () => {
    const theme = resolveTheme({
      paletteId: "paper",
      overrides: null,
      fontPair: null,
      preset: null,
    });
    const vars = themeCssVariables(theme);
    expect(vars["--color-paper"]).toBe("#fbfaf7");
    expect(vars["--color-on-accent"]).toBe("#fbfaf7");
    expect(vars["--font-display-family"]).toBe("var(--font-amiri)");
    expect(vars["--font-body-family"]).toBe("var(--font-plex-arabic)");
  });

  it("emits only known keys", () => {
    const theme = resolveTheme({
      paletteId: "paper",
      overrides: null,
      fontPair: null,
      preset: null,
    });
    const keys = Object.keys(themeCssVariables(theme));
    for (const key of keys) {
      expect(key.startsWith("--color-") || key.startsWith("--font-")).toBe(true);
    }
  });

  /*
   * The second of the two independent defences. resolveTheme already filters,
   * so reaching this throw means something bypassed it -- which is exactly when
   * a hard failure beats emitting the value.
   */
  it("throws rather than emit a value that is not a hex colour", () => {
    const theme = resolveTheme({
      paletteId: "paper",
      overrides: null,
      fontPair: null,
      preset: null,
    });
    const tampered = {
      ...theme,
      palette: { ...theme.palette, accent: "#000;}" },
    };
    expect(() => themeCssVariables(tampered)).toThrow(InvalidThemeError);
  });
});
