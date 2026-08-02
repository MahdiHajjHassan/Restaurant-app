import type { Palette } from "./tokens";

/**
 * Curated starting points.
 *
 * Every one of these passes the editor's own contrast rules -- asserted by
 * test, because a shipped palette the editor would reject is a contradiction
 * the owner experiences as a bug.
 */
export const PALETTES = {
  /** Warm paper, bay-leaf green. The platform default. */
  paper: {
    paper: "#fbfaf7",
    paperSunk: "#f1efe9",
    ink: "#1a1a17",
    muted: "#6e6a5f",
    rule: "#ddd9cf",
    accent: "#3f5d3a",
    onAccent: "#fbfaf7",
  },
  /** Near-white with a saturated red. The chain-menu register. */
  crimson: {
    paper: "#ffffff",
    paperSunk: "#f6f6f4",
    ink: "#1c1b1a",
    muted: "#5f5c58",
    rule: "#e3e1dd",
    accent: "#c8102e",
    onAccent: "#ffffff",
  },
  /** Dark surface, warm white ink, amber accent. */
  charcoal: {
    paper: "#1a1815",
    paperSunk: "#24211c",
    ink: "#f0ede4",
    muted: "#a6a094",
    rule: "#35312a",
    accent: "#e0a33a",
    onAccent: "#1a1815",
  },
  /** Cream and deep olive. */
  olive: {
    paper: "#f7f4ea",
    paperSunk: "#ede9db",
    ink: "#201f18",
    muted: "#66634f",
    rule: "#dcd7c4",
    accent: "#4a5330",
    onAccent: "#f7f4ea",
  },
  /** White and deep navy. */
  navy: {
    paper: "#ffffff",
    paperSunk: "#f2f4f7",
    ink: "#14171c",
    muted: "#565d66",
    rule: "#dfe3e8",
    accent: "#1c3f6e",
    onAccent: "#ffffff",
  },
} satisfies Record<string, Palette>;

export type PaletteId = keyof typeof PALETTES;

export const DEFAULT_PALETTE_ID: PaletteId = "paper";

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && value in PALETTES;
}
