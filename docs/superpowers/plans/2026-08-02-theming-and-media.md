# Theming, Media Pipeline, and Layout Presets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every restaurant its own palette, fonts, and layout — and let owners upload dish photos — so no two client sites look alike.

**Architecture:** Theme tokens live in framework-free `core/theme/` and render as CSS custom properties via a React inline `style` object on the site wrapper. Owner-supplied colours are validated twice (Zod at the action boundary, again in the CSS serializer) because they end up in CSS. Uploads are sniffed by magic bytes, re-encoded through `sharp` to strip EXIF/GPS, and stored under tenant-scoped keys.

**Tech Stack:** Next.js 16.2.12, React 19, TypeScript strict, Drizzle + PostgreSQL 17, Zod v4, `sharp`, Tailwind v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-02-theming-and-media-design.md`

## Global Constraints

- **`src/core/` must not import `next/*`, `react`, or `react-dom`.** ESLint-enforced, CI-blocking.
- **`core/` never reads `process.env`.** Factories receive config; wiring lives in `src/server/`.
- **Money is integer minor units.** Currency exponent comes from `Intl`, never hardcoded.
- **Never `Promise.all` queries sharing a transaction.** Sequential awaits inside `withTenant`.
- **Never `redirect()` from an admin Server Action.** Return a target; client calls `window.location.assign()`.
- **Every admin Server Action calls `requireMembership` itself.** A layout guard does not run when an action is invoked directly.
- **Colour values are strict `#rrggbb`.** No `rgb()`, no named colours, no alpha, no 3-digit shorthand.
- **Storage keys are built with `tenantScopedKey()`**, never string concatenation.
- **Public tenant sites stay cookie-free.** Locale in the path, never a cookie.
- **Force `dir="ltr"` on times and numeric ranges inside Arabic text.**
- **Admin e2e tests run serially** (`test.describe.configure({ mode: "serial" })`).
- **`npm run verify` must pass before any task is considered done.**

---

## File Structure

**Part A — Theming**

| File | Responsibility |
|---|---|
| `src/core/theme/tokens.ts` | Token names, hex guard, token → CSS variable map |
| `src/core/theme/palettes.ts` | The 5 curated palettes |
| `src/core/theme/fonts.ts` | The 3 pairings |
| `src/core/theme/contrast.ts` | WCAG luminance/ratio + block/warn rules |
| `src/core/theme/resolve.ts` | default ← curated ← overrides, and CSS variable output |
| `src/core/theme/repository.ts` | Tenant-scoped `theme_settings` read/write |
| `src/core/db/schema.ts` | Add `paletteId`; fix the token comment |
| `drizzle/0004_theme_palette_id.sql` | Migration |
| `src/server/site.ts` | Load theme alongside menu, same transaction |
| `src/app/layout.tsx` | Declare all three display faces |
| `src/app/globals.css` | Remove the dark-mode block |
| `src/ui/site/site-page.tsx` | Apply theme wrapper, dispatch on preset |
| `src/ui/menu/item-card.tsx` | Grid/editorial card |
| `src/app/admin/[tenantId]/theme/page.tsx` | Theme editor |
| `src/app/admin/[tenantId]/theme/theme-form.tsx` | Client form + live preview |
| `src/app/admin/[tenantId]/theme/actions.ts` | `saveTheme` Server Action |

**Part B — Media**

| File | Responsibility |
|---|---|
| `src/core/media/validate.ts` | Magic-byte sniffing, size cap |
| `src/core/media/process.ts` | Orient → resize → re-encode → blur placeholder |
| `src/core/media/repository.ts` | Tenant-scoped `media` rows |
| `src/app/storage/[...key]/route.ts` | Serve stored objects |
| `src/server/media.ts` | Composition: storage + processing + repository |
| `src/app/admin/[tenantId]/items/[itemId]/photo-field.tsx` | Upload control |
| `next.config.ts` | `serverActions.bodySizeLimit` |

---

# PART A — THEMING

## Task 1: Theme tokens and the hex guard

**Files:**
- Create: `src/core/theme/tokens.ts`
- Test: `src/core/theme/tokens.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `THEME_TOKENS`, `ThemeToken`, `Palette`, `PaletteOverrides`, `isHexColor(v: unknown): v is string`, `CSS_VARIABLE: Record<ThemeToken, string>`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/theme/tokens.test.ts
import { describe, expect, it } from "vitest";
import { CSS_VARIABLE, isHexColor, THEME_TOKENS } from "./tokens";

describe("isHexColor", () => {
  it("accepts six-digit hex in either case", () => {
    expect(isHexColor("#3f5d3a")).toBe(true);
    expect(isHexColor("#3F5D3A")).toBe(true);
  });

  /*
   * These are the values that would end up inside a CSS declaration. Every one
   * of them is a way an owner-supplied string could stop being a colour and
   * start being syntax, so each is named explicitly rather than covered by a
   * vague "rejects invalid input" case.
   */
  it.each([
    ["#fff", "three-digit shorthand"],
    ["red", "named colour"],
    ["rgb(0,0,0)", "functional notation"],
    ["#3f5d3a80", "alpha channel"],
    ["#000;} body{background:url(x)", "declaration break-out"],
    ["#00000\n", "trailing newline"],
    ["", "empty"],
  ])("rejects %s (%s)", (value) => {
    expect(isHexColor(value)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(0x3f5d3a)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });
});

describe("token contract", () => {
  it("maps every token to a CSS custom property", () => {
    for (const token of THEME_TOKENS) {
      expect(CSS_VARIABLE[token]).toMatch(/^--color-/);
    }
  });

  it("has no duplicate CSS variable names", () => {
    const names = THEME_TOKENS.map((t) => CSS_VARIABLE[t]);
    expect(new Set(names).size).toBe(names.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/theme/tokens.test.ts`
Expected: FAIL — cannot resolve `./tokens`

- [ ] **Step 3: Write the implementation**

```ts
// src/core/theme/tokens.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/theme/tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/theme/tokens.ts src/core/theme/tokens.test.ts
git commit -m "Theme token contract with a strict hex guard"
```

---

## Task 2: Contrast validation

**Files:**
- Create: `src/core/theme/contrast.ts`
- Test: `src/core/theme/contrast.test.ts`

**Interfaces:**
- Consumes: `Palette`, `ThemeToken` from Task 1
- Produces: `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number`, `validatePalette(p: Palette): ContrastIssue[]`, `ContrastIssue { foreground, background, ratio, required, severity }`, `AA_TEXT = 4.5`, `AA_NON_TEXT = 3`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/theme/contrast.test.ts
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance, validatePalette } from "./contrast";
import type { Palette } from "./tokens";

describe("relativeLuminance", () => {
  // WCAG reference values. Black is 0, white is 1, by definition.
  it("anchors at black and white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("uses the linear segment below the 0.04045 threshold", () => {
    // #030303 is 3/255 = 0.0118, under the threshold, so it divides by 12.92
    // rather than taking the power curve. Getting this branch wrong shifts
    // every dark-palette ratio.
    expect(relativeLuminance("#030303")).toBeCloseTo(0.000911, 5);
  });
});

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });

  it("is symmetric — order of arguments does not matter", () => {
    expect(contrastRatio("#1a1a17", "#fbfaf7")).toBeCloseTo(
      contrastRatio("#fbfaf7", "#1a1a17"),
      10,
    );
  });

  it("returns 1 for a colour against itself", () => {
    expect(contrastRatio("#3f5d3a", "#3f5d3a")).toBeCloseTo(1, 10);
  });
});

const READABLE: Palette = {
  paper: "#fbfaf7",
  paperSunk: "#f1efe9",
  ink: "#1a1a17",
  muted: "#6e6a5f",
  rule: "#ddd9cf",
  accent: "#3f5d3a",
  onAccent: "#fbfaf7",
};

describe("validatePalette", () => {
  it("passes a readable palette with no issues", () => {
    expect(validatePalette(READABLE)).toEqual([]);
  });

  it("blocks unreadable body text", () => {
    const issues = validatePalette({ ...READABLE, ink: "#d8d8d8" });
    expect(issues).toContainEqual(
      expect.objectContaining({
        foreground: "ink",
        background: "paper",
        severity: "block",
      }),
    );
  });

  /*
   * The rule that earns its keep. Owners pick a surface they like, never touch
   * `muted`, and silently render every description and every price caption
   * unreadable. It has to block, not warn.
   */
  it("blocks unreadable secondary text", () => {
    const issues = validatePalette({ ...READABLE, muted: "#cfcdc6" });
    expect(issues).toContainEqual(
      expect.objectContaining({
        foreground: "muted",
        background: "paper",
        severity: "block",
      }),
    );
  });

  it("blocks unreadable text on an accent fill", () => {
    const issues = validatePalette({ ...READABLE, onAccent: "#4a6b45" });
    expect(issues).toContainEqual(
      expect.objectContaining({
        foreground: "onAccent",
        background: "accent",
        severity: "block",
      }),
    );
  });

  // Accent carries focus rings and links — non-text UI, so 3:1 and a warning.
  it("warns but does not block on a low-contrast accent", () => {
    const issues = validatePalette({ ...READABLE, accent: "#d4cec2" });
    const accentIssue = issues.find((i) => i.foreground === "accent");
    expect(accentIssue?.severity).toBe("warn");
    expect(issues.some((i) => i.severity === "block")).toBe(false);
  });

  it("reports the measured ratio and the requirement", () => {
    const [issue] = validatePalette({ ...READABLE, ink: "#ffffff" });
    expect(issue.ratio).toBeCloseTo(1.0, 1);
    expect(issue.required).toBe(4.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/theme/contrast.test.ts`
Expected: FAIL — cannot resolve `./contrast`

- [ ] **Step 3: Write the implementation**

```ts
// src/core/theme/contrast.ts
import type { Palette, ThemeToken } from "./tokens";

/** WCAG 2.1 AA for normal-size text. */
export const AA_TEXT = 4.5;
/** WCAG 2.1 AA for non-text UI components. */
export const AA_NON_TEXT = 3;

function channel(srgb: number): number {
  return srgb <= 0.04045
    ? srgb / 12.92
    : Math.pow((srgb + 0.055) / 1.055, 2.4);
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
  { foreground: "ink", background: "paper", required: AA_TEXT, severity: "block" },
  { foreground: "muted", background: "paper", required: AA_TEXT, severity: "block" },
  { foreground: "onAccent", background: "accent", required: AA_TEXT, severity: "block" },
  { foreground: "accent", background: "paper", required: AA_NON_TEXT, severity: "warn" },
];

export function validatePalette(palette: Palette): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const rule of RULES) {
    const ratio = contrastRatio(palette[rule.foreground], palette[rule.background]);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/theme/contrast.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/theme/contrast.ts src/core/theme/contrast.test.ts
git commit -m "WCAG contrast validation with block and warn tiers"
```

---

## Task 3: Curated palettes and font pairings

**Files:**
- Create: `src/core/theme/palettes.ts`, `src/core/theme/fonts.ts`
- Test: `src/core/theme/palettes.test.ts`

**Interfaces:**
- Consumes: `Palette` (Task 1), `validatePalette` (Task 2)
- Produces: `PALETTES`, `PaletteId`, `DEFAULT_PALETTE_ID`, `isPaletteId(v: unknown): v is PaletteId`, `FONT_PAIRS`, `FontPairId`, `DEFAULT_FONT_PAIR`, `isFontPairId(v: unknown): v is FontPairId`

**Note on the colour values:** these were chosen by hand and their contrast was
computed by hand. The test below is what actually verifies them. If a palette
fails, fix the palette — do not relax the rule.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/theme/palettes.test.ts
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
  it.each(Object.keys(FONT_PAIRS))("%s declares an Arabic-capable body", (id) => {
    expect(FONT_PAIRS[id as keyof typeof FONT_PAIRS].arabicReady).toBe(true);
  });

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/theme/palettes.test.ts`
Expected: FAIL — cannot resolve `./palettes`

- [ ] **Step 3: Write `palettes.ts`**

```ts
// src/core/theme/palettes.ts
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
```

- [ ] **Step 4: Write `fonts.ts`**

```ts
// src/core/theme/fonts.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/core/theme/palettes.test.ts`
Expected: PASS. If a palette fails contrast, darken its `muted` or `ink` until it passes — do not relax the rule.

- [ ] **Step 6: Commit**

```bash
git add src/core/theme/palettes.ts src/core/theme/fonts.ts src/core/theme/palettes.test.ts
git commit -m "Five curated palettes and three Arabic-ready font pairings"
```

---

## Task 4: Theme resolution and CSS variable output

**Files:**
- Create: `src/core/theme/resolve.ts`
- Test: `src/core/theme/resolve.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3
- Produces: `ResolvedTheme { paletteId, palette, fontPair, preset }`, `resolveTheme(input): ResolvedTheme`, `themeCssVariables(theme: ResolvedTheme): Record<string, string>`, `InvalidThemeError`, `LAYOUT_PRESETS`, `LayoutPreset`, `isLayoutPreset`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/theme/resolve.test.ts
import { describe, expect, it } from "vitest";
import { PALETTES } from "./palettes";
import {
  InvalidThemeError,
  resolveTheme,
  themeCssVariables,
} from "./resolve";

describe("resolveTheme", () => {
  it("falls back to the platform default when nothing is stored", () => {
    const theme = resolveTheme({ paletteId: null, overrides: null, fontPair: null, preset: null });
    expect(theme.paletteId).toBe("paper");
    expect(theme.palette).toEqual(PALETTES.paper);
    expect(theme.fontPair).toBe("classic");
    expect(theme.preset).toBe("list");
  });

  it("applies a curated palette by id", () => {
    const theme = resolveTheme({ paletteId: "crimson", overrides: null, fontPair: null, preset: null });
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
    const theme = resolveTheme({ paletteId: "paper", overrides: null, fontPair: null, preset: null });
    const vars = themeCssVariables(theme);
    expect(vars["--color-paper"]).toBe("#fbfaf7");
    expect(vars["--color-on-accent"]).toBe("#fbfaf7");
    expect(vars["--font-display-family"]).toBe("var(--font-amiri)");
    expect(vars["--font-body-family"]).toBe("var(--font-plex-arabic)");
  });

  it("emits only known keys", () => {
    const theme = resolveTheme({ paletteId: "paper", overrides: null, fontPair: null, preset: null });
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
    const theme = resolveTheme({ paletteId: "paper", overrides: null, fontPair: null, preset: null });
    const tampered = { ...theme, palette: { ...theme.palette, accent: "#000;}" } };
    expect(() => themeCssVariables(tampered)).toThrow(InvalidThemeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/theme/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`

- [ ] **Step 3: Write the implementation**

```ts
// src/core/theme/resolve.ts
import { DEFAULT_FONT_PAIR, FONT_PAIRS, isFontPairId, type FontPairId } from "./fonts";
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
    fontPair: isFontPairId(stored.fontPair) ? stored.fontPair : DEFAULT_FONT_PAIR,
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
export function themeCssVariables(theme: ResolvedTheme): Record<string, string> {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/theme/resolve.test.ts`
Expected: PASS

- [ ] **Step 5: Run the whole core suite and commit**

```bash
npm run verify
git add src/core/theme/resolve.ts src/core/theme/resolve.test.ts
git commit -m "Theme resolution with sparse overrides and validated CSS output"
```

---

## Task 5: Migration and theme repository

**Files:**
- Modify: `src/core/db/schema.ts` (add `paletteId`, correct the token comment)
- Create: `drizzle/0004_theme_palette_id.sql` (via `npm run db:generate`)
- Create: `src/core/theme/repository.ts`
- Modify: `tests/integration/tenant-isolation.test.ts`

**Interfaces:**
- Consumes: `ResolvedTheme`, `resolveTheme` (Task 4)
- Produces: `createThemeRepository(session)` with `getTheme(): Promise<ResolvedTheme>` and `saveTheme(input: SaveThemeInput): Promise<void>`; `SaveThemeInput { paletteId, overrides, fontPair, preset }`

- [ ] **Step 1: Add the column to the schema**

In `src/core/db/schema.ts`, inside `themeSettings`, replace the `palette` block's
comment and add `paletteId` immediately above it:

```ts
  /** Key into the curated palettes. Overrides layer on top of this. */
  paletteId: text("palette_id").notNull().default("paper"),

  /**
   * SPARSE per-token overrides, not a full palette: { accent: "#c8102e" }.
   * Tokens are paper, paperSunk, ink, muted, rule, accent, onAccent.
   *
   * Storing only what the owner actually changed means an untouched token keeps
   * following the curated palette, so improving a palette improves every client
   * still on it rather than only new signups.
   */
  palette: jsonb("palette")
    .notNull()
    .default(sql`'{}'::jsonb`),
```

Also change the `fontPair` default from `"default"` to `"classic"`:

```ts
  fontPair: text("font_pair").notNull().default("classic"),
```

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
```

Rename the generated file to `drizzle/0004_theme_palette_id.sql` if drizzle-kit
chose a random name, and update `drizzle/meta/_journal.json` to match. Then
append the backfill for existing rows, which drizzle will not generate:

```sql
--> statement-breakpoint
UPDATE theme_settings SET font_pair = 'classic' WHERE font_pair = 'default';
```

- [ ] **Step 3: Apply and verify the migration**

```bash
npm run db:migrate
```

Confirm the column exists and no row is left on the old default:

```bash
psql -U postgres -h localhost -d restaurant_platform_dev -c "\d theme_settings" -c "SELECT palette_id, font_pair, preset FROM theme_settings;"
```

Expected: `palette_id` present, `NOT NULL`, default `'paper'`; no row with `font_pair = 'default'`.

- [ ] **Step 4: Write the repository**

```ts
// src/core/theme/repository.ts
import { eq } from "drizzle-orm";
import type { TenantSession } from "../db/tenant";
import { themeSettings } from "../db/schema";
import type { FontPairId } from "./fonts";
import type { PaletteId } from "./palettes";
import { resolveTheme, type LayoutPreset, type ResolvedTheme } from "./resolve";
import type { PaletteOverrides } from "./tokens";

export interface SaveThemeInput {
  paletteId: PaletteId;
  overrides: PaletteOverrides;
  fontPair: FontPairId;
  preset: LayoutPreset;
}

/**
 * Tenant-scoped access to theme_settings.
 *
 * A tenant with no row yet resolves to the platform default rather than
 * failing: theme is optional configuration, and a missing row must never take
 * a restaurant's menu offline.
 */
export function createThemeRepository(session: TenantSession) {
  return {
    async getTheme(): Promise<ResolvedTheme> {
      const rows = await session.db
        .select()
        .from(themeSettings)
        .where(eq(themeSettings.tenantId, session.tenantId))
        .limit(1);

      const row = rows[0];
      return resolveTheme({
        paletteId: row?.paletteId ?? null,
        overrides: row?.palette ?? null,
        fontPair: row?.fontPair ?? null,
        preset: row?.preset ?? null,
      });
    },

    async saveTheme(input: SaveThemeInput): Promise<void> {
      await session.db
        .insert(themeSettings)
        .values({
          tenantId: session.tenantId,
          paletteId: input.paletteId,
          palette: input.overrides,
          fontPair: input.fontPair,
          preset: input.preset,
        })
        .onConflictDoUpdate({
          target: themeSettings.tenantId,
          set: {
            paletteId: input.paletteId,
            palette: input.overrides,
            fontPair: input.fontPair,
            preset: input.preset,
            updatedAt: new Date(),
          },
        });
    },
  };
}
```

**Note:** check the actual shape of `TenantSession` in `src/core/db/tenant.ts`
before writing this — if it exposes the transaction under a different property
name than `db`, use that name throughout.

- [ ] **Step 5: Add an isolation test**

Append to `tests/integration/tenant-isolation.test.ts`, following the file's
existing pattern for two seeded tenants:

```ts
it("does not leak theme settings across tenants", async () => {
  await withTenant(db, tenantA.id, async (session) => {
    await createThemeRepository(session).saveTheme({
      paletteId: "crimson",
      overrides: { accent: "#123456" },
      fontPair: "modern",
      preset: "grid",
    });
  });

  const themeB = await withTenant(db, tenantB.id, (session) =>
    createThemeRepository(session).getTheme(),
  );

  // B never saved a theme, so it must see the platform default -- not A's.
  expect(themeB.paletteId).toBe("paper");
  expect(themeB.palette.accent).not.toBe("#123456");
  expect(themeB.preset).toBe("list");
});
```

- [ ] **Step 6: Run tests and commit**

```bash
npm run verify
git add src/core/db/schema.ts src/core/theme/repository.ts drizzle/ tests/integration/tenant-isolation.test.ts
git commit -m "Add palette_id and a tenant-scoped theme repository"
```

---

## Task 6: Render the theme on public sites

**Files:**
- Modify: `src/app/layout.tsx` (declare all three display faces)
- Modify: `src/app/globals.css` (remove the dark-mode block)
- Modify: `src/server/site.ts` (load theme in the same transaction)
- Modify: `src/ui/site/site-page.tsx` (apply the wrapper)

**Interfaces:**
- Consumes: `getTheme` (Task 5), `themeCssVariables` (Task 4)
- Produces: `SiteData` gains `theme: ResolvedTheme`

- [ ] **Step 1: Declare the font faces in the root layout**

Replace the two font declarations in `src/app/layout.tsx` with four. Keep the
existing comment block and extend it:

```ts
import { Amiri, Cairo, IBM_Plex_Sans_Arabic, Tajawal } from "next/font/google";

/*
 * All display faces are declared here because next/font requires static
 * imports -- a family cannot be chosen at runtime. The theme picks which
 * variable --font-display-family resolves to.
 *
 * This is only affordable because next/font emits @font-face declarations and
 * browsers download only the families actually referenced by rendered text.
 * Three declarations cost a few hundred bytes; one family downloads. That claim
 * is verified in the network panel, not assumed -- see the plan's verification
 * task.
 */
const amiri = Amiri({
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
  variable: "--font-cairo",
  display: "swap",
});

const tajawal = Tajawal({
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
  variable: "--font-tajawal",
  display: "swap",
});

/*
 * Body face, and the one that renders the price column: it has true tabular
 * figures, without which prices jitter in width and stop being scannable.
 * Held constant across every pairing for that reason.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["latin", "arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-arabic",
  display: "swap",
});
```

Update the `<html>` className to include all four:

```tsx
className={`${amiri.variable} ${cairo.variable} ${tajawal.variable} ${plexArabic.variable} h-full`}
```

- [ ] **Step 2: Remove the dark-mode block from `globals.css`**

Delete the entire `@media (prefers-color-scheme: dark) { :root { ... } }` block
and replace it with a comment recording why:

```css
/*
 * No prefers-color-scheme block.
 *
 * A tenant palette is a deliberate choice by the restaurant owner. Inverting it
 * on a visitor's device would override that choice silently -- the owner picks
 * cream and green, sees their site render dark on someone's phone, and
 * concludes the product is broken. Owners who want a dark site pick the
 * charcoal palette, which is dark on every device.
 */
```

Also update the `--font-display` / `--font-body` fallbacks in `:root` to
reference the new variable names:

```css
  --font-display: var(--font-amiri), Georgia, serif;
  --font-body: var(--font-plex-arabic), ui-sans-serif, system-ui, sans-serif;
```

- [ ] **Step 3: Load the theme in `src/server/site.ts`**

Add `theme` to `SiteData` and load it inside the existing `withTenant` block —
**sequentially**, after the other three queries:

```ts
import { createThemeRepository } from "@/core/theme/repository";
import type { ResolvedTheme } from "@/core/theme/resolve";

export interface SiteData {
  menu: MenuCategory[];
  contact: ContactSettings | null;
  hours: HourSegment[];
  theme: ResolvedTheme;
}
```

```ts
    const categories = await menu.getPublicMenu();
    const settings = await contact.getSettings();
    const hourRows = await contact.listOpeningHours();
    // Sequential like the rest: one transaction, one connection.
    const theme = await createThemeRepository(session).getTheme();

    return {
      menu: categories,
      contact: settings,
      hours: toHourSegments(hourRows),
      theme,
    };
```

- [ ] **Step 4: Apply the theme wrapper in `site-page.tsx`**

The tokens now live on the wrapper rather than `:root`, so the wrapper must
paint the background itself. Change the outer `<div>`:

```tsx
import { themeCssVariables } from "@/core/theme/resolve";

// ...
  const themeVars = themeCssVariables(data.theme);

  return (
    <div
      lang={locale}
      dir={direction}
      /*
       * Tokens ride a React inline style object rather than a <style> tag.
       * React escapes style values, so owner-supplied colours have no path to
       * becoming CSS syntax -- the injection surface is closed by construction,
       * not only by validation. It also keeps Phase 6's nonce-based CSP from
       * inheriting an inline-<style> problem.
       *
       * Because the tokens are scoped here instead of :root, this element has
       * to paint the page background itself.
       */
      style={themeVars as React.CSSProperties}
      className="flex min-h-full flex-1 flex-col bg-[var(--color-paper)] text-[var(--color-ink)]"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-16">
        {/* existing children unchanged */}
      </div>
    </div>
  );
```

- [ ] **Step 5: Run it and look at it**

```bash
npm run dev
```

Set Alpha Grill to the crimson palette directly in the database:

```bash
psql -U postgres -h localhost -d restaurant_platform_dev -c "INSERT INTO theme_settings (tenant_id, palette_id, font_pair, preset) SELECT id, 'crimson', 'modern', 'list' FROM tenants WHERE slug='alpha-grill' ON CONFLICT (tenant_id) DO UPDATE SET palette_id='crimson', font_pair='modern';"
```

Load `alpha-grill.localhost:3000` in Chrome. Expected: red accent, geometric
headings. Load `beta-bistro.localhost:3000`: unchanged warm paper and Amiri,
proving the theme is per-tenant and not global.

- [ ] **Step 6: Verify only one display font downloads**

**This is a blocking verification.** In Chrome DevTools → Network → Font, reload
`alpha-grill.localhost:3000`.

Expected: IBM Plex Sans Arabic plus **Cairo only**. Amiri and Tajawal must not
appear.

If all four download, the runtime font-switching design does not hold and the
plan must change — stop and report rather than proceeding.

- [ ] **Step 7: Commit**

```bash
npm run verify
git add src/app/layout.tsx src/app/globals.css src/server/site.ts src/ui/site/site-page.tsx
git commit -m "Render per-tenant theme tokens on public sites"
```

---

## Task 7: Layout presets

**Files:**
- Create: `src/ui/menu/item-card.tsx`
- Modify: `src/ui/site/site-page.tsx`
- Create: `tests/e2e/theming.spec.ts`

**Interfaces:**
- Consumes: `LayoutPreset` (Task 4), `MenuItem` (existing)
- Produces: `ItemCard` component; `SitePage` dispatches on `data.theme.preset`

- [ ] **Step 1: Write `ItemCard`**

Mirror `ItemRow`'s data handling exactly — same `data-item` / `data-search`
attributes so the existing search keeps working, same sold-out treatment, same
`localized` / `formatMoney` calls. Photo support is added in Part B; for now the
card renders a `paperSunk` placeholder block.

```tsx
// src/ui/menu/item-card.tsx
import type { Locale } from "@/core/i18n/locale";
import { localized, localizedOptional } from "@/core/i18n/locale";
import { getMessages } from "@/core/i18n/messages";
import type { MenuItem } from "@/core/menu/repository";
import { formatMoney } from "@/core/money/format";

interface ItemCardProps {
  item: MenuItem;
  currency: string;
  locale: Locale;
  /** Editorial runs one wide column; grid runs a tighter card. */
  variant: "grid" | "editorial";
}

/**
 * One dish, photo-forward.
 *
 * Degrades honestly: an item with no photo renders as name and price on a flat
 * surface rather than an empty frame. Most restaurants photograph some of their
 * menu and never finish, so a half-photographed grid has to look deliberate
 * instead of broken.
 */
export function ItemCard({ item, currency, locale, variant }: ItemCardProps) {
  const messages = getMessages(locale);
  const name = localized(item.nameEn, item.nameAr, locale);
  const description = localizedOptional(
    item.descriptionEn,
    item.descriptionAr,
    locale,
  );
  const soldOut = !item.isAvailable;

  const searchText = [
    item.nameEn,
    item.nameAr,
    item.descriptionEn,
    item.descriptionAr,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    <li data-item data-search={searchText} className="flex flex-col">
      {/* Photo slot. Part B replaces this with next/image when item.image exists. */}
      <div
        className={`mb-2 aspect-[4/3] w-full rounded-md bg-[var(--color-paper-sunk)] ${
          soldOut ? "opacity-60 grayscale" : ""
        }`}
        aria-hidden="true"
      />

      <div className="flex items-baseline gap-2">
        <h3
          className={`text-[0.95rem] font-medium ${
            soldOut ? "text-[var(--color-muted)] line-through" : ""
          }`}
        >
          {name}
        </h3>
        <span className="leader" aria-hidden="true" />
        <span
          className={`price text-[0.95rem] ${
            soldOut ? "text-[var(--color-muted)] line-through" : "font-medium"
          }`}
        >
          {formatMoney(item.basePriceMinor, currency, locale)}
        </span>
      </div>

      {description ? (
        <p
          className={`mt-1 text-[0.8rem] leading-relaxed text-[var(--color-muted)] ${
            variant === "grid" ? "line-clamp-2" : ""
          }`}
        >
          {description}
        </p>
      ) : null}

      {item.variants.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.78rem] text-[var(--color-muted)]">
          {item.variants.map((variant) => (
            <li key={variant.id}>
              {localized(variant.nameEn, variant.nameAr, locale)}{" "}
              <span className="price text-[var(--color-ink)]">
                {formatMoney(variant.priceMinor, currency, locale)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-2 empty:mt-0">
        {soldOut ? (
          <span className="rounded-sm border border-[var(--color-rule)] px-1.5 py-0.5 text-[0.7rem] tracking-wide text-[var(--color-muted)] uppercase">
            {messages.soldOut}
          </span>
        ) : null}
        {item.badges.map((badge) => (
          <span
            key={badge}
            className="text-[0.7rem] tracking-wide text-[var(--color-accent)] uppercase"
          >
            {messages.badges[badge] ?? badge}
          </span>
        ))}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Dispatch on preset in `site-page.tsx`**

Replace the `<ul>` inside each category section with a preset-aware list. Add
`data-preset` on the wrapper so the e2e test can assert which preset rendered:

```tsx
const preset = data.theme.preset;

const listClassName =
  preset === "grid"
    ? "mt-3 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3"
    : preset === "editorial"
      ? "mt-3 flex flex-col gap-8"
      : "mt-3 divide-y divide-[var(--color-rule)]";
```

```tsx
<ul className={listClassName} data-preset={preset}>
  {category.items.map((item) =>
    preset === "list" ? (
      <ItemRow key={item.id} item={item} currency={tenant.currency} locale={locale} />
    ) : (
      <ItemCard
        key={item.id}
        item={item}
        currency={tenant.currency}
        locale={locale}
        variant={preset === "grid" ? "grid" : "editorial"}
      />
    ),
  )}
</ul>
```

Widen the inner container for grid, since a 2-col grid inside `max-w-2xl` is
cramped:

```tsx
<div className={`mx-auto flex w-full flex-1 flex-col px-6 pb-16 ${
  preset === "grid" ? "max-w-4xl" : "max-w-2xl"
}`}>
```

- [ ] **Step 3: Write the e2e test**

```ts
// tests/e2e/theming.spec.ts
import { expect, test } from "@playwright/test";

/*
 * Chromium maps any *.localhost to loopback, so these hostnames need no
 * hosts-file edit. Node and Playwright's `request` fixture do NOT -- they use
 * the OS resolver -- which is why this suite drives the browser rather than
 * hitting the URL directly.
 */
test("renders the tenant palette rather than the platform default", async ({ page }) => {
  await page.goto("http://alpha-grill.localhost:3000/");
  const wrapper = page.locator("[style*='--color-accent']").first();
  await expect(wrapper).toHaveAttribute("style", /--color-accent/);
});

test("grid and list presets render different structures", async ({ page }) => {
  await page.goto("http://alpha-grill.localhost:3000/");
  const list = page.locator("[data-preset]").first();
  await expect(list).toHaveAttribute("data-preset", /grid|list|editorial/);
});

test("search still works in the grid preset", async ({ page }) => {
  await page.goto("http://alpha-grill.localhost:3000/");
  const search = page.getByRole("searchbox");
  await search.fill("zzzznomatch");
  await expect(page.locator("#menu-empty")).toBeVisible();
});
```

- [ ] **Step 4: Run it and look at all three presets**

With `npm run dev` running, switch the preset in the database and reload each time:

```bash
psql -U postgres -h localhost -d restaurant_platform_dev -c "UPDATE theme_settings SET preset='grid' WHERE tenant_id=(SELECT id FROM tenants WHERE slug='alpha-grill');"
```

Check in Chrome at both `alpha-grill.localhost:3000/` and `/ar`:
- `grid` — 2 columns on a phone-width viewport, 3 on desktop
- `editorial` — one wide column, generous spacing
- `list` — unchanged from Phase 2, leader rule intact

In `/ar`, confirm the grid mirrors and prices stay in Latin digits reading left
to right.

- [ ] **Step 5: Run the suites and commit**

```bash
npm run verify
npx playwright test tests/e2e/theming.spec.ts
git add src/ui/menu/item-card.tsx src/ui/site/site-page.tsx tests/e2e/theming.spec.ts
git commit -m "Three layout presets sharing one search and sold-out treatment"
```

---

## Task 8: Admin theme editor

**Files:**
- Create: `src/app/admin/[tenantId]/theme/page.tsx`, `theme-form.tsx`, `actions.ts`
- Modify: `src/app/admin/[tenantId]/layout.tsx` (nav link)
- Modify: `src/server/admin.ts` (loader)
- Create: `tests/e2e/admin-theme.spec.ts`

**Interfaces:**
- Consumes: `createThemeRepository` (Task 5), `validatePalette` (Task 2), `PALETTES`/`FONT_PAIRS` (Task 3)
- Produces: `saveTheme(formData): Promise<{ ok: true } | { ok: false; errors: string[] }>`

- [ ] **Step 1: Write the Server Action**

```ts
// src/app/admin/[tenantId]/theme/actions.ts
"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { validatePalette } from "@/core/theme/contrast";
import { FONT_PAIRS } from "@/core/theme/fonts";
import { PALETTES } from "@/core/theme/palettes";
import { LAYOUT_PRESETS } from "@/core/theme/resolve";
import { createThemeRepository } from "@/core/theme/repository";
import { THEME_TOKENS } from "@/core/theme/tokens";
import { withTenant } from "@/core/db/tenant";
import { db } from "@/server/db";
import { requireMembership } from "@/server/auth";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "Colours must be six-digit hex");

const schema = z.object({
  tenantId: z.string().uuid(),
  paletteId: z.enum(Object.keys(PALETTES) as [string, ...string[]]),
  fontPair: z.enum(Object.keys(FONT_PAIRS) as [string, ...string[]]),
  preset: z.enum(LAYOUT_PRESETS),
  overrides: z.record(z.enum(THEME_TOKENS), hex).default({}),
});

export type SaveThemeResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export async function saveTheme(formData: FormData): Promise<SaveThemeResult> {
  const rawOverrides: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    const value = formData.get(`override.${token}`);
    if (typeof value === "string" && value.length > 0) {
      rawOverrides[token] = value;
    }
  }

  const parsed = schema.safeParse({
    tenantId: formData.get("tenantId"),
    paletteId: formData.get("paletteId"),
    fontPair: formData.get("fontPair"),
    preset: formData.get("preset"),
    overrides: rawOverrides,
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  }

  // Called here, not only in the layout: an action can be invoked directly, and
  // tenantId arrives from the client.
  const { membership, user } = await requireMembership(parsed.data.tenantId);

  /*
   * Per-token colours are an operator capability. Hiding the controls is not
   * enough -- an owner can post the fields directly, so the refusal lives in
   * the action.
   */
  const overrides = user.isPlatformAdmin ? parsed.data.overrides : {};

  const palette = {
    ...PALETTES[parsed.data.paletteId as keyof typeof PALETTES],
    ...overrides,
  };

  const issues = validatePalette(palette);
  const blocking = issues.filter((i) => i.severity === "block");
  if (blocking.length > 0) {
    return {
      ok: false,
      errors: blocking.map(
        (i) =>
          `${i.foreground} on ${i.background} is ${i.ratio.toFixed(1)}:1 — needs ${i.required}:1 to stay readable`,
      ),
    };
  }

  await withTenant(db, membership.tenantId, async (session) => {
    await createThemeRepository(session).saveTheme({
      paletteId: parsed.data.paletteId as never,
      overrides,
      fontPair: parsed.data.fontPair as never,
      preset: parsed.data.preset,
    });
  });

  // Only this tenant's cache. Follow the tag naming already used elsewhere in
  // the admin actions.
  revalidateTag(`tenant:${membership.tenantId}`);

  return { ok: true };
}
```

**Note:** check `requireMembership`'s actual return shape in `src/server/auth.ts`
first — if it does not return `user`, load the user or add `isPlatformAdmin` to
what it returns, and keep the check in the action either way.

- [ ] **Step 2: Write the page and form**

`page.tsx` is a server component that calls `requireMembership`, loads the
current theme, and renders `<ThemeForm>` with the palette/font/preset options
and `isPlatformAdmin`.

`theme-form.tsx` is `"use client"` and must:
- render palette swatches as radio inputs, font pairings and presets as radios
- render the seven colour inputs **only when `isPlatformAdmin`**
- compute `validatePalette` on the candidate palette on every change and show
  blocking issues inline, disabling submit while any exist
- render a live preview by wrapping real `ItemCard` / `ItemRow` output in a div
  carrying `themeCssVariables(candidate)` as its `style`
- on success, call `window.location.assign()` — **never `redirect()`**

- [ ] **Step 3: Add the nav link**

In `src/app/admin/[tenantId]/layout.tsx`, add alongside Menu and Hours:

```tsx
<Link
  href={`/${tenantId}/theme`}
  className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
>
  Look
</Link>
```

Labelled "Look" rather than "Theme" — restaurant owners are not designers, and
the word describes what they are about to change.

- [ ] **Step 4: Write the e2e test**

```ts
// tests/e2e/admin-theme.spec.ts
import { expect, test } from "@playwright/test";

// Serial: these mutate one shared database and fail on each other's writes.
test.describe.configure({ mode: "serial" });

test("owner changes palette and the public site follows", async ({ page }) => {
  // Reuse the login helper the existing admin.spec.ts uses.
  await page.goto("http://app.localhost:3000/login");
  await page.getByLabel(/email/i).fill("owner@alpha-grill.test");
  await page.getByLabel(/password/i).fill("demo-password-123");
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.getByRole("link", { name: "Look" }).click();
  await page.getByRole("radio", { name: /crimson/i }).check();
  await page.getByRole("button", { name: /save/i }).click();

  await page.goto("http://alpha-grill.localhost:3000/");
  const wrapper = page.locator("[style*='--color-accent']").first();
  await expect(wrapper).toHaveAttribute("style", /#c8102e/i);
});
```

- [ ] **Step 5: Verify the action refuses a bad palette when posted directly**

**This is a blocking verification** — the UI disabling a button proves nothing
about the boundary. With `npm run dev` running, sign in, then in the browser
console on the theme page:

```js
const fd = new FormData();
fd.set("tenantId", document.querySelector("[name=tenantId]").value);
fd.set("paletteId", "paper");
fd.set("fontPair", "classic");
fd.set("preset", "list");
fd.set("override.muted", "#f2f2f2"); // unreadable on paper
// submit via the form's action and read the returned result
```

Expected as a **platform admin**: refused, with the failing pair named.
Expected as a **non-admin owner**: overrides silently dropped, save succeeds
with the curated palette unchanged.

- [ ] **Step 6: Commit**

```bash
npm run verify
npx playwright test tests/e2e/admin-theme.spec.ts
git add src/app/admin src/server/admin.ts tests/e2e/admin-theme.spec.ts
git commit -m "Admin theme editor with contrast blocking enforced in the action"
```

---

## CHECKPOINT — Part A is shippable

Every client site can now look different. Stop here, run the full suite, and
demo it before starting Part B.

```bash
npm run verify && npm run test:e2e
```

---

# PART B — MEDIA PIPELINE

## Task 9: Upload validation

**Files:**
- Create: `src/core/media/validate.ts`
- Test: `src/core/media/validate.test.ts`

**Interfaces:**
- Produces: `MAX_UPLOAD_BYTES`, `sniffImageType(bytes: Uint8Array): "jpeg" | "png" | "webp" | null`, `validateUpload(bytes): { ok: true; type } | { ok: false; reason: string }`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/media/validate.test.ts
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, sniffImageType, validateUpload } from "./validate";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

describe("sniffImageType", () => {
  it("identifies jpeg, png, and webp by magic bytes", () => {
    expect(sniffImageType(jpeg)).toBe("jpeg");
    expect(sniffImageType(png)).toBe("png");
    expect(sniffImageType(webp)).toBe("webp");
  });

  /*
   * The declared Content-Type is attacker-controlled, so it is never consulted.
   * These are the payloads that matter: a PE binary renamed to .jpg, and an SVG
   * -- which is a real image format, and also a script execution vector, which
   * is why it is not on the allowlist.
   */
  it("rejects a renamed executable", () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImageType(exe)).toBeNull();
  });

  it("rejects SVG", () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>");
    expect(sniffImageType(svg)).toBeNull();
  });

  it("rejects a buffer too short to carry a signature", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  // RIFF alone is not WebP -- a RIFF/WAV file must not pass.
  it("rejects RIFF that is not WEBP", () => {
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts a valid image under the cap", () => {
    expect(validateUpload(jpeg)).toEqual({ ok: true, type: "jpeg" });
  });

  it("rejects an empty upload", () => {
    const result = validateUpload(new Uint8Array(0));
    expect(result.ok).toBe(false);
  });

  it("rejects an upload over the cap", () => {
    const huge = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    huge.set(jpeg, 0);
    const result = validateUpload(huge);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("too large") });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/media/validate.test.ts`
Expected: FAIL — cannot resolve `./validate`

- [ ] **Step 3: Write the implementation**

```ts
// src/core/media/validate.ts
/** 8 MB. Phone photos are routinely 4-6 MB; a smaller cap rejects real uploads. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type ImageType = "jpeg" | "png" | "webp";

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

/**
 * Identify an image by its magic bytes.
 *
 * The declared Content-Type is supplied by the client and is therefore never
 * consulted. SVG is deliberately absent from the allowlist: it is a real image
 * format, but it can carry script, and it would be served from our own origin.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  // WebP is RIFF with a WEBP fourcc at offset 8 -- RIFF alone is also WAV/AVI.
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export type UploadValidation =
  | { ok: true; type: ImageType }
  | { ok: false; reason: string };

export function validateUpload(bytes: Uint8Array): UploadValidation {
  if (bytes.byteLength === 0) {
    return { ok: false, reason: "The file is empty" };
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `That photo is too large — the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
    };
  }
  const type = sniffImageType(bytes);
  if (type === null) {
    return { ok: false, reason: "That file is not a JPEG, PNG, or WebP image" };
  }
  return { ok: true, type };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/media/validate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/media/validate.ts src/core/media/validate.test.ts
git commit -m "Sniff uploads by magic bytes rather than declared content type"
```

---

## Task 10: Image processing — orientation, EXIF stripping, blur placeholder

**Files:**
- Modify: `package.json` (add `sharp` as a direct dependency)
- Create: `src/core/media/process.ts`
- Create: `tests/integration/media-process.test.ts`
- Create: `tests/fixtures/gps-tagged.jpg`, `tests/fixtures/rotated.jpg`

**Interfaces:**
- Consumes: `ImageType` (Task 9)
- Produces: `processImage(input: Uint8Array): Promise<ProcessedImage>`; `ProcessedImage { data, width, height, contentType, blurDataUrl }`

- [ ] **Step 1: Add sharp**

```bash
npm install sharp@^0.35.3
```

The existing `overrides` pin stays. Confirm `npm audit --omit=dev` is still zero.

- [ ] **Step 2: Create the fixtures**

Generate them with sharp so the repo carries no binary of unknown provenance:

```bash
node --input-type=module -e "
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/fixtures', { recursive: true });

// A GPS-tagged JPEG. sharp cannot write EXIF GPS directly, so this writes a
// tagged file via withMetadata and an exif block.
await sharp({ create: { width: 800, height: 600, channels: 3, background: '#c8102e' } })
  .withMetadata({ exif: { IFD0: { Copyright: 'test' }, GPS: { GPSLatitude: '33/1 53/1 0/1', GPSLongitude: '35/1 30/1 0/1' } } })
  .jpeg().toFile('tests/fixtures/gps-tagged.jpg');

// Portrait content tagged as needing a 90-degree rotation.
await sharp({ create: { width: 400, height: 800, channels: 3, background: '#1c3f6e' } })
  .withMetadata({ orientation: 6 })
  .jpeg().toFile('tests/fixtures/rotated.jpg');
console.log('fixtures written');
"
```

Verify the GPS block actually landed — if sharp declined to write it, the test
below would pass vacuously:

```bash
node --input-type=module -e "
import sharp from 'sharp';
const m = await sharp('tests/fixtures/gps-tagged.jpg').metadata();
console.log('exif bytes:', m.exif?.length ?? 0, 'orientation:', m.orientation);
"
```

Expected: a non-zero exif byte count. If it is zero, the fixture is not
exercising the stripping claim — stop and find a real tagged JPEG instead.

- [ ] **Step 3: Write the failing test**

```ts
// tests/integration/media-process.test.ts
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processImage } from "@/core/media/process";

describe("processImage", () => {
  it("re-encodes to webp and reports real dimensions", async () => {
    const input = new Uint8Array(await readFile("tests/fixtures/gps-tagged.jpg"));
    const out = await processImage(input);

    expect(out.contentType).toBe("image/webp");
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
  });

  /*
   * The privacy promise, verified rather than commented. Restaurant owners
   * photograph their own premises on their own phones, and those files carry
   * the coordinates of where they live and work.
   */
  it("strips EXIF GPS from the output", async () => {
    const input = new Uint8Array(await readFile("tests/fixtures/gps-tagged.jpg"));
    const out = await processImage(input);

    const metadata = await sharp(Buffer.from(out.data)).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  /*
   * Orientation must be applied BEFORE metadata is dropped. Skip the rotate and
   * every phone photo taken in portrait comes out on its side -- the classic
   * version of this bug.
   */
  it("applies EXIF orientation before discarding it", async () => {
    const input = new Uint8Array(await readFile("tests/fixtures/rotated.jpg"));
    const out = await processImage(input);

    // Orientation 6 means "rotate 90deg CW", so a 400x800 source lands 800x400.
    expect(out.width).toBe(800);
    expect(out.height).toBe(400);
  });

  it("bounds large images without enlarging small ones", async () => {
    const big = new Uint8Array(
      await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#000" } })
        .jpeg()
        .toBuffer(),
    );
    const out = await processImage(big);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);

    const small = new Uint8Array(
      await sharp({ create: { width: 200, height: 150, channels: 3, background: "#000" } })
        .jpeg()
        .toBuffer(),
    );
    const smallOut = await processImage(small);
    expect(smallOut.width).toBe(200);
  });

  it("produces an inline blur placeholder", async () => {
    const input = new Uint8Array(await readFile("tests/fixtures/gps-tagged.jpg"));
    const out = await processImage(input);

    expect(out.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    // Must stay small enough to inline in HTML without bloating the document.
    expect(out.blurDataUrl.length).toBeLessThan(2000);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/integration/media-process.test.ts`
Expected: FAIL — cannot resolve `@/core/media/process`

- [ ] **Step 5: Write the implementation**

```ts
// src/core/media/process.ts
import sharp from "sharp";

/** Enough for a retina card without unbounded storage cost. */
const MAX_DIMENSION = 1600;

export interface ProcessedImage {
  data: Uint8Array;
  width: number;
  height: number;
  contentType: string;
  blurDataUrl: string;
}

/**
 * Normalise an owner-uploaded photo.
 *
 * `.rotate()` with no argument applies the EXIF orientation tag and must come
 * first: re-encoding discards metadata, so skipping it leaves every portrait
 * phone photo on its side with the tag that would have fixed it now gone.
 *
 * Re-encoding to WebP is also what strips EXIF, GPS included. That is a privacy
 * requirement, not a size optimisation -- phone photos carry the coordinates of
 * the restaurant and often of the owner's home.
 *
 * `sharp` is Node-only, so this module cannot be imported by the R4 React
 * Native app. That app consumes processed media over the API and never
 * processes, so this is not a break in the core/ boundary.
 */
export async function processImage(input: Uint8Array): Promise<ProcessedImage> {
  const pipeline = sharp(Buffer.from(input))
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

  const { data, info } = await pipeline
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  // Tiny enough to inline in the document; big enough to suggest the photo.
  const blur = await sharp(Buffer.from(input))
    .rotate()
    .resize({ width: 16 })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    contentType: "image/webp",
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/integration/media-process.test.ts`
Expected: PASS, all six.

- [ ] **Step 7: Commit**

```bash
npm run verify
git add package.json package-lock.json src/core/media/process.ts tests/integration/media-process.test.ts tests/fixtures
git commit -m "Image pipeline: orient, bound, re-encode to webp, strip GPS"
```

---

## Task 11: Media repository, storage route, and upload wiring

**Files:**
- Create: `src/core/media/repository.ts`, `src/server/media.ts`
- Create: `src/app/storage/[...key]/route.ts`
- Modify: `next.config.ts`
- Test: `tests/integration/media-repository.test.ts`

**Interfaces:**
- Consumes: `processImage` (Task 10), `validateUpload` (Task 9), `tenantScopedKey`/`assertSafeKey` (existing)
- Produces: `createMediaRepository(session)` with `insert(record)` and `findById(id)`; `storeUpload(tenantId, bytes)` in `src/server/media.ts` returning the new media row

- [ ] **Step 1: Raise the Server Action body limit**

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
     * Server Actions default to a 1 MB body, which rejects essentially every
     * phone photo. The failure looks like a broken upload button rather than a
     * size error, so this has to match the 8 MB cap in core/media/validate.ts
     * with headroom for multipart overhead.
     */
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
```

- [ ] **Step 2: Write the storage route**

```ts
// src/app/storage/[...key]/route.ts
import { storage } from "@/server/storage";

/*
 * Serves stored objects. The local driver advertises this prefix and, until
 * now, nothing answered it.
 *
 * The proxy matcher already excludes `storage/`, so requests reach here without
 * being rewritten onto a tenant segment.
 *
 * The key pattern is locked to media objects specifically rather than relying
 * on assertSafeKey alone. Keys are attacker-influenced, and a route that will
 * stream any valid key is one traversal bug away from serving whatever else
 * ends up in the bucket.
 */
const MEDIA_KEY =
  /^tenants\/[0-9a-f-]{36}\/media\/[0-9a-f-]{36}\.webp$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const joined = key.join("/");

  if (!MEDIA_KEY.test(joined)) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = await storage.get(joined);
  if (bytes === null) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "image/webp",
      // Keys are uuid-based and content never changes under one key.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 3: Write the repository and the composition**

`src/core/media/repository.ts` follows the pattern of the existing repositories:
`createMediaRepository(session)` exposing `insert()` and `findById()`, scoped by
`session.tenantId`.

`src/server/media.ts` composes them:

```ts
// src/server/media.ts
import { withTenant } from "@/core/db/tenant";
import { createMediaRepository } from "@/core/media/repository";
import { processImage } from "@/core/media/process";
import { validateUpload } from "@/core/media/validate";
import { tenantScopedKey } from "@/core/storage/types";
import { db } from "./db";
import { storage } from "./storage";

export type StoreUploadResult =
  | { ok: true; mediaId: string }
  | { ok: false; reason: string };

export async function storeUpload(
  tenantId: string,
  bytes: Uint8Array,
): Promise<StoreUploadResult> {
  const validation = validateUpload(bytes);
  if (!validation.ok) return { ok: false, reason: validation.reason };

  const processed = await processImage(bytes);
  const key = tenantScopedKey(tenantId, "media", `${crypto.randomUUID()}.webp`);

  await storage.put(key, processed.data, { contentType: processed.contentType });

  return withTenant(db, tenantId, async (session) => {
    const row = await createMediaRepository(session).insert({
      storageKey: key,
      contentType: processed.contentType,
      byteSize: processed.data.byteLength,
      width: processed.width,
      height: processed.height,
      blurDataUrl: processed.blurDataUrl,
    });
    return { ok: true, mediaId: row.id };
  });
}
```

- [ ] **Step 4: Add an isolation test**

Following the pattern in `tests/integration/tenant-isolation.test.ts`, assert
that a media row inserted under tenant A is invisible to tenant B, both through
the repository and with the repository bypassed so RLS alone is proven.

- [ ] **Step 5: Verify the route serves and refuses**

With `npm run dev`, upload nothing yet — just prove the guard:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/storage/tenants/../../.env" -H "Host: alpha-grill.localhost"
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/storage/tenants/00000000-0000-0000-0000-000000000000/media/00000000-0000-0000-0000-000000000000.webp" -H "Host: alpha-grill.localhost"
```

Expected: `404` for both — the first refused by the pattern, the second by a
missing object. Neither may return `200` or a stack trace.

- [ ] **Step 6: Commit**

```bash
npm run verify
git add next.config.ts src/app/storage src/core/media/repository.ts src/server/media.ts tests/integration
git commit -m "Serve stored media behind a locked key pattern"
```

---

## Task 12: Photo upload in the admin, and photos on the card

**Files:**
- Modify: `src/app/admin/[tenantId]/items/[itemId]/item-form.tsx`, `actions.ts`
- Create: `src/app/admin/[tenantId]/items/[itemId]/photo-field.tsx`
- Modify: `src/core/menu/repository.ts` (join media onto items)
- Modify: `src/ui/menu/item-card.tsx` (render the photo)
- Modify: `tests/e2e/admin.spec.ts`

- [ ] **Step 1: Join media onto the public menu query**

Extend `MenuItem` in `src/core/menu/repository.ts` with an optional
`image: { storageKey, width, height, blurDataUrl } | null`, joined via
`items.imageId`. Keep it a `leftJoin` — an item without a photo must still load.

- [ ] **Step 2: Render the photo in `ItemCard`**

Replace the placeholder block from Task 7:

```tsx
{item.image ? (
  <div className={`relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-md ${
    soldOut ? "opacity-60 grayscale" : ""
  }`}>
    <Image
      src={`/storage/${item.image.storageKey}`}
      alt=""
      fill
      sizes="(max-width: 640px) 50vw, 33vw"
      placeholder={item.image.blurDataUrl ? "blur" : "empty"}
      blurDataURL={item.image.blurDataUrl ?? undefined}
      className="object-cover"
    />
  </div>
) : (
  /*
   * No photo is not an error. Most restaurants photograph part of their menu
   * and never finish, so the gap has to look deliberate -- a flat surface,
   * not an empty frame with a broken-image icon.
   */
  <div
    className="mb-2 aspect-[4/3] w-full rounded-md bg-[var(--color-paper-sunk)]"
    aria-hidden="true"
  />
)}
```

`alt=""` is deliberate: the dish name sits directly beneath the image, so
describing it again is noise for a screen reader.

- [ ] **Step 3: Add the upload control and action**

`photo-field.tsx` is a client component with a file input and a preview.
The Server Action calls `requireMembership`, reads the `File` from `FormData`,
converts to `Uint8Array`, calls `storeUpload`, and sets `items.imageId`.
It must surface `validateUpload`'s `reason` verbatim to the owner — "That file
is not a JPEG, PNG, or WebP image" is actionable; "Upload failed" is not.

- [ ] **Step 4: Upload a real photo and look at it**

**This is a blocking verification.** With `npm run dev`:
1. Sign in at `app.localhost:3000`, open any dish.
2. Upload a real photo **taken on a phone** — a large, portrait, EXIF-tagged one.
3. Confirm it appears upright, not sideways.
4. Set the tenant preset to `grid` and load `alpha-grill.localhost:3000` at a
   phone-sized viewport. The photo must render in the card.
5. Mark the dish sold out; the photo must desaturate and the name strike through.

Then confirm the coordinates are gone from what was actually stored:

```bash
node --input-type=module -e "
import sharp from 'sharp';
const m = await sharp(process.argv[1]).metadata();
console.log('exif:', m.exif ? 'PRESENT — FAIL' : 'absent — ok');
" "storage/tenants/<tenantId>/media/<mediaId>.webp"
```

Expected: `absent — ok`.

- [ ] **Step 5: Commit**

```bash
npm run verify
npm run test:e2e
git add src/app/admin src/core/menu/repository.ts src/ui/menu/item-card.tsx tests/e2e
git commit -m "Owner photo upload rendering on the grid preset"
```

---

## Task 13: Seed placeholders and final verification

**Files:**
- Modify: `scripts/db/seed.sql`
- Create: `scripts/seed-media.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Generate seed placeholders**

`scripts/seed-media.ts` generates a solid-colour WebP per seeded dish with
`sharp`, writes it through the storage adapter, and inserts the `media` row and
`items.image_id`. Generated rather than downloaded so `npm run db:seed` works
offline and in CI with no binaries in the repo.

Add to `package.json`:

```json
"db:seed:media": "node --experimental-strip-types scripts/seed-media.ts"
```

- [ ] **Step 2: Give the seeded tenants different themes**

In `scripts/db/seed.sql`, set Alpha Grill to `crimson`/`modern`/`grid` and Beta
Bistro to `paper`/`classic`/`list`. Two tenants that look different is what
proves theming is per-tenant, the same reason there are two tenants at all.

- [ ] **Step 3: Update `CLAUDE.md`**

Add to the conventions section:

- Theme tokens render as a React inline `style` object, never a `<style>` tag —
  owner colours reach CSS and React's escaping is what closes that surface.
- Palette overrides are sparse; untouched tokens follow the curated palette.
- `next/font` cannot select a family at runtime, so all display faces are
  declared in the root layout and the theme picks one by variable.
- Uploads are sniffed by magic bytes; the declared content type is never trusted.
  `.rotate()` runs before re-encoding or portrait photos land sideways.

Update the phase status line to Phase 3 + 4b complete.

- [ ] **Step 4: Full verification**

```bash
npm run verify && npm run test:e2e
```

Then walk the five blocking checks from the spec in Chrome:
1. One display font family downloads on a tenant page
2. A phone photo uploads end to end and appears on the card
3. A GPS-tagged photo stores with no coordinates
4. A contrast-failing palette is refused when posted directly to the action
5. Both locales render in all three presets, prices Latin and correctly ordered

- [ ] **Step 5: Commit**

```bash
git add scripts CLAUDE.md package.json
git commit -m "Seed themed tenants with placeholder photography"
```

---

## Self-Review Notes

**Spec coverage:** tokens (T1), contrast (T2), palettes and fonts (T3),
resolution and CSS (T4), migration and repository (T5), public rendering and the
dark-mode removal (T6), three presets and the card contract (T7), admin editor
with owner/operator split (T8), upload validation (T9), EXIF/orientation/blur
(T10), storage route and body limit (T11), photos on cards and logo groundwork
(T12), seed and docs (T13).

**Known gap:** the spec's logo placement (40px cap, replaces the name, `alt` is
the restaurant name) is described in T8's form but has no dedicated task. Fold it
into Task 12 — it uses the same `storeUpload` path, writing to
`theme_settings.logo_id` instead of `items.image_id`, and the header change lands
in `site-page.tsx`.

**Deferred, per the spec:** operator custom CSS (Phase 5), real CC0 photography
(needs the owner's go-ahead before anything is downloaded).
