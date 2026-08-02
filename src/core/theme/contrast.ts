import type { Palette, ThemeToken } from "./tokens";

/** WCAG 2.1 AA for normal-size text. */
export const AA_TEXT = 4.5;
/** WCAG 2.1 AA for non-text UI components. */
export const AA_NON_TEXT = 3;

function channel(srgb: number): number {
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastIssue {
  foreground: ThemeToken;
  background: ThemeToken;
  ratio: number;
  required: number;
  severity: "block" | "warn";
}

interface Rule {
  foreground: ThemeToken;
  background: ThemeToken;
  required: number;
  severity: "block" | "warn";
}

/**
 * What the editor refuses, and what it merely flags.
 *
 * Blocking is reserved for text: a palette that fails these is unreadable, and
 * shipping it is an accessibility failure the owner cannot see coming. The
 * accent rule warns instead because accent carries focus rings and links --
 * degraded, not unusable -- and blocking it would reject palettes that are
 * merely restrained.
 */
const RULES: Rule[] = [
  {
    foreground: "ink",
    background: "paper",
    required: AA_TEXT,
    severity: "block",
  },
  {
    foreground: "muted",
    background: "paper",
    required: AA_TEXT,
    severity: "block",
  },
  {
    foreground: "onAccent",
    background: "accent",
    required: AA_TEXT,
    severity: "block",
  },
  {
    foreground: "accent",
    background: "paper",
    required: AA_NON_TEXT,
    severity: "warn",
  },
];

export function validatePalette(palette: Palette): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const rule of RULES) {
    const ratio = contrastRatio(
      palette[rule.foreground],
      palette[rule.background],
    );
    if (ratio < rule.required) {
      issues.push({
        foreground: rule.foreground,
        background: rule.background,
        ratio,
        required: rule.required,
        severity: rule.severity,
      });
    }
  }
  return issues;
}
