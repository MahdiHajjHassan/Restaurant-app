import {
  DEFAULT_FONT_PAIR,
  FONT_PAIRS,
  isFontPairId,
  type FontPairId,
} from "./fonts";
import {
  DEFAULT_PALETTE_ID,
  isPaletteId,
  PALETTES,
  type PaletteId,
} from "./palettes";
import {
  CSS_VARIABLE,
  isHexColor,
  THEME_TOKENS,
  type Palette,
  type PaletteOverrides,
} from "./tokens";

export const LAYOUT_PRESETS = ["grid", "list", "editorial"] as const;
export type LayoutPreset = (typeof LAYOUT_PRESETS)[number];
export const DEFAULT_PRESET: LayoutPreset = "list";

export function isLayoutPreset(value: unknown): value is LayoutPreset {
  return (
    typeof value === "string" &&
    (LAYOUT_PRESETS as readonly string[]).includes(value)
  );
}

/**
 * Generic fallbacks appended after the webfont.
 *
 * Kept identical to the platform defaults in globals.css: if the webfont fails
 * to load, a themed page and an unthemed one should degrade to the same thing.
 */
const DISPLAY_FALLBACKS = "Georgia, serif";
const BODY_FALLBACKS = "ui-sans-serif, system-ui, sans-serif";

export class InvalidThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidThemeError";
  }
}

export interface ResolvedTheme {
  paletteId: PaletteId;
  palette: Palette;
  fontPair: FontPairId;
  preset: LayoutPreset;
}

export interface StoredTheme {
  paletteId: unknown;
  overrides: unknown;
  fontPair: unknown;
  preset: unknown;
}

/**
 * Keep only recognised tokens carrying valid hex.
 *
 * `overrides` arrives from a jsonb column, which round-trips whatever was
 * written to it. Filtering here means the rest of the system can treat a
 * resolved palette as trustworthy.
 */
function sanitizeOverrides(raw: unknown): PaletteOverrides {
  if (typeof raw !== "object" || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const clean: PaletteOverrides = {};
  for (const token of THEME_TOKENS) {
    const value = source[token];
    if (isHexColor(value)) clean[token] = value;
  }
  return clean;
}

/** Platform default <- curated palette <- sparse per-token overrides. */
export function resolveTheme(stored: StoredTheme): ResolvedTheme {
  const paletteId = isPaletteId(stored.paletteId)
    ? stored.paletteId
    : DEFAULT_PALETTE_ID;

  return {
    paletteId,
    palette: { ...PALETTES[paletteId], ...sanitizeOverrides(stored.overrides) },
    fontPair: isFontPairId(stored.fontPair)
      ? stored.fontPair
      : DEFAULT_FONT_PAIR,
    preset: isLayoutPreset(stored.preset) ? stored.preset : DEFAULT_PRESET,
  };
}

/**
 * The values handed to React as an inline style object.
 *
 * Emits only known keys and re-validates every colour. resolveTheme already
 * filters, so a throw here means the theme was constructed by some other path
 * -- precisely the case where failing loudly beats writing the value into CSS.
 */
export function themeCssVariables(
  theme: ResolvedTheme,
): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const token of THEME_TOKENS) {
    const value = theme.palette[token];
    if (!isHexColor(value)) {
      throw new InvalidThemeError(
        `Token ${token} is not a hex colour: ${JSON.stringify(value)}`,
      );
    }
    vars[CSS_VARIABLE[token]] = value;
  }

  /*
   * These set --font-display / --font-body directly, NOT the inner
   * --font-*-family variables that globals.css uses for the platform default.
   *
   * Custom properties are substituted at computed-value time on the element
   * where they are declared. globals.css declares
   * `--font-display: var(--font-display-family), ...` on :root, so that var()
   * is resolved against :root and inherits down as an already-baked font stack.
   * Overriding --font-display-family further down the tree is therefore too
   * late -- the heading keeps rendering in the platform default, which is a
   * silent wrong-font bug rather than a visible failure.
   *
   * Declaring the final property here resolves var(--font-cairo) against the
   * wrapper, where next/font's family variables are inherited from <html>.
   */
  const pair = FONT_PAIRS[theme.fontPair];
  vars["--font-display"] = `var(${pair.displayVariable}), ${DISPLAY_FALLBACKS}`;
  vars["--font-body"] = `var(${pair.bodyVariable}), ${BODY_FALLBACKS}`;

  return vars;
}
