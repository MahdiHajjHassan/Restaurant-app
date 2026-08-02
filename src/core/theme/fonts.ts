/**
 * Curated pairings.
 *
 * The display face varies; the body face does not. The body face renders the
 * price column, which requires true tabular figures -- IBM Plex Sans Arabic has
 * them, and Cairo and Tajawal are not verified for it, so they take display
 * duty only. Every pairing includes a genuine Arabic face rather than a Latin
 * family with Arabic bolted on.
 *
 * `displayVariable` and `bodyVariable` name CSS custom properties declared by
 * next/font in the root layout. core/ cannot import next/font -- it names the
 * variables and the composition root binds them.
 */
export interface FontPair {
  label: string;
  displayVariable: string;
  bodyVariable: string;
  arabicReady: boolean;
}

export const FONT_PAIRS = {
  /** Today's look. Reference document. */
  classic: {
    label: "Classic",
    displayVariable: "--font-amiri",
    bodyVariable: "--font-plex-arabic",
    arabicReady: true,
  },
  /** Geometric headings. The chain-menu register. */
  modern: {
    label: "Modern",
    displayVariable: "--font-cairo",
    bodyVariable: "--font-plex-arabic",
    arabicReady: true,
  },
  /** Rounded and friendly. Casual grills. */
  warm: {
    label: "Warm",
    displayVariable: "--font-tajawal",
    bodyVariable: "--font-plex-arabic",
    arabicReady: true,
  },
} satisfies Record<string, FontPair>;

export type FontPairId = keyof typeof FONT_PAIRS;

export const DEFAULT_FONT_PAIR: FontPairId = "classic";

export function isFontPairId(value: unknown): value is FontPairId {
  return typeof value === "string" && value in FONT_PAIRS;
}
