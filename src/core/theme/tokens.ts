/**
 * The theme token contract.
 *
 * These names are the CSS custom properties already used throughout
 * globals.css and the components. Deliberately NOT the generic
 * surface/onSurface/border vocabulary: introducing a second set of names would
 * mean a mapping layer that exists only to be kept in sync.
 */
export const THEME_TOKENS = [
  "paper",
  "paperSunk",
  "ink",
  "muted",
  "rule",
  "accent",
  "onAccent",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

export type Palette = Record<ThemeToken, string>;
export type PaletteOverrides = Partial<Palette>;

/**
 * Anchored, case-insensitive, exactly six hex digits.
 *
 * Colour values reach CSS, so this is a security boundary rather than a
 * convenience check. One accepted format is one format that has to be reasoned
 * about: shorthand, alpha, and functional notation are all rejected so there is
 * no second parsing path where a semicolon or brace could survive.
 */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

export const CSS_VARIABLE: Record<ThemeToken, string> = {
  paper: "--color-paper",
  paperSunk: "--color-paper-sunk",
  ink: "--color-ink",
  muted: "--color-muted",
  rule: "--color-rule",
  accent: "--color-accent",
  onAccent: "--color-on-accent",
};
