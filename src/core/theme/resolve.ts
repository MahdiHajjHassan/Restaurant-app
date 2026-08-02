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

  const pair = FONT_PAIRS[theme.fontPair];
  vars["--font-display-family"] = `var(${pair.displayVariable})`;
  vars["--font-body-family"] = `var(${pair.bodyVariable})`;

  return vars;
}
