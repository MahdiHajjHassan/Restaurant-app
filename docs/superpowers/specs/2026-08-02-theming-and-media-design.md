# Phase 3 + 4b — Theming, Media Pipeline, and Layout Presets

**Date:** 2026-08-02
**Status:** Approved
**Supersedes:** the Phase 3 sketch in `docs/roadmap.md` (theming only)

## Why this exists

Every client site currently renders identically. That directly undercuts the
sales pitch — "customized for every restaurant" — and it is the first thing an
owner notices in a demo.

The product owner has additionally asked that the flagship look match a
photo-forward chain menu (Chick-fil-A's) rather than the austere typographic
list shipped in Phase 2. That is a deliberate reversal of the Phase 2 design
direction, made with the trade-off understood, and it is what pulls image upload
forward from a later phase into this one: **a photo-card grid with no photo
pipeline is not demoable.**

The Phase 2 list is not discarded. It becomes the `list` preset — the honest
default for a 90-item grill menu with no photography, which by the product
owner's own market read is the volume client.

## Scope

In:

- `core/theme/` — tokens, curated palettes, font pairings, contrast validation
- `core/media/` — upload validation, EXIF stripping, resizing, blur placeholder
- `/storage/[...key]` route handler (the local driver advertises this prefix and
  nothing serves it today)
- Three layout presets: `grid`, `list`, `editorial`
- Admin theme editor with live preview, split owner/operator by power
- Admin image upload: per-item photos and tenant logo
- Migration `0004`

Out, deliberately:

- **Operator custom CSS.** The riskiest surface in the feature; it belongs with
  the Phase 5 operator console that gates it.
- **Real photography in the seed.** Seed generates placeholders programmatically
  so it works offline and in CI. Sourcing CC0 photography is a separate step
  requiring the owner's go-ahead before anything is downloaded.

## Architecture

`core/` stays framework-free — the ESLint boundary rule enforces it, and R4's
React Native app is the reason. Nothing below imports `next/*` or `react`.

```
src/core/theme/
  tokens.ts        token contract + the resolved-theme type
  palettes.ts      5 curated palettes
  fonts.ts         3 pairings, each with a real Arabic face
  contrast.ts      sRGB luminance, WCAG ratio, block/warn rules
  css.ts           resolved theme -> validated custom-property record
  repository.ts    tenant-scoped read/write

src/core/media/
  validate.ts      magic-byte sniffing, size cap
  process.ts       orient -> resize -> re-encode -> blur placeholder
  repository.ts    tenant-scoped media rows
```

`process.ts` is the one module that needs `sharp`. `sharp` is pure Node with no
framework coupling, so it does not violate the boundary — but it does mean
`core/media/process.ts` cannot be imported from React Native. The R4 app
consumes *processed* media over the API; it never processes. Noted so a future
reader does not mistake it for a boundary leak.

## Token contract

The canonical token names are the CSS custom properties **already in
`globals.css`**, not the names in the `theme_settings` schema comment (which
says `surface`/`onSurface`/`border` and is wrong). The schema comment gets
corrected; no mapping layer is introduced.

| Token | CSS variable | Role |
|---|---|---|
| `paper` | `--color-paper` | Page surface |
| `paperSunk` | `--color-paper-sunk` | Recessed surface (cards, inputs) |
| `ink` | `--color-ink` | Body text |
| `muted` | `--color-muted` | Secondary text |
| `rule` | `--color-rule` | Hairlines, dividers, leader rule |
| `accent` | `--color-accent` | Links, focus rings, Open-now badge |
| `onAccent` | `--color-on-accent` | Text on an accent fill |

All values are strict `#rrggbb`. No `rgb()`, no named colours, no alpha — one
format to validate is one format that cannot be smuggled through.

## Data model — migration `0004`

`theme_settings` gains one column:

```sql
ALTER TABLE theme_settings ADD COLUMN palette_id text NOT NULL DEFAULT 'paper';
```

`palette` (jsonb, already present) holds **only per-token overrides**, not a full
palette. An owner who changes nothing inherits future improvements to the
curated palette; an owner who changed only the accent keeps that one change and
inherits the rest. Resolution order:

```
platform default  <-  curated palette (palette_id)  <-  overrides (palette jsonb)
```

`font_pair` default migrates `'default'` -> `'classic'`, with existing rows
backfilled. `preset` already defaults to `'list'` and is unchanged.

`theme_settings` and `media` are both already in `TENANT_SCOPED_TABLES` with RLS
policies, so no policy work is needed — but the isolation test must be extended
to cover writes through the new repositories.

## Font loading — the constraint that shapes the design

`next/font/google` requires **static** imports; a font family cannot be selected
at runtime. So all display faces load in the root layout, each bound to its own
variable, and the theme decides which variable `--font-display-family` resolves
to.

This is only affordable because `next/font` emits `@font-face` declarations and
**browsers download only the families actually referenced by rendered text**.
Three declarations cost a few hundred bytes; one family downloads.

**This must be verified in the browser network panel, not assumed.** If all three
families download, the <500KB budget is blown and the design changes. It is
listed as a blocking verification step below.

Pairings vary the display face and hold the body face constant at IBM Plex Sans
Arabic:

| Key | Display | Body | Register |
|---|---|---|---|
| `classic` | Amiri | IBM Plex Sans Arabic | Today's look; reference document |
| `modern` | Cairo | IBM Plex Sans Arabic | Geometric; the chain-menu register |
| `warm` | Tajawal | IBM Plex Sans Arabic | Rounded, casual grills |

The body face is held constant on purpose: it renders the price column, which
requires true tabular figures. Cairo and Tajawal are not verified for that, so
they get display duty only. Every pairing includes a genuine Arabic face — none
is a Latin face with Arabic bolted on.

## Curated palettes

| Key | Character |
|---|---|
| `paper` | Warm paper, bay-leaf green. Current default |
| `crimson` | Near-white, saturated red. The chain-menu register |
| `charcoal` | Dark surface, warm white ink, amber accent |
| `olive` | Cream, deep olive |
| `navy` | White, deep navy |

Every shipped palette must pass its own contrast rules. A test asserts this, so a
future palette cannot be added that the editor would refuse to save.

## Contrast validation

`contrast.ts` computes WCAG 2.1 relative luminance over sRGB and the
`(L1 + 0.05) / (L2 + 0.05)` ratio.

**Blocks save** — AA text, 4.5:1:

- `ink` on `paper`
- `muted` on `paper`
- `onAccent` on `accent`

**Warns only** — non-text UI, 3:1:

- `accent` on `paper`

`muted` on `paper` is the rule that earns its keep. Owners pick a surface they
like, never touch `muted`, and silently render their secondary text illegible.

Blocking is enforced **in the Server Action**, not only in the browser. Client
validation is a courtesy; the action is the boundary.

## Colour input is an XSS boundary

Palette values are owner-controlled and end up in CSS. Two independent defences,
mirroring the two-layer reasoning already used for tenant isolation:

1. Zod validates `/^#[0-9a-f]{6}$/i` at the Server Action boundary.
2. `css.ts` re-validates every value and emits **only known token keys**,
   throwing on anything else.

Tokens render as a **React inline `style` object** on the site wrapper —
`style={{ "--color-accent": "#3f5d3a" }}` — never `dangerouslySetInnerHTML` into
a `<style>` tag. React escapes style values, so the injection surface is closed
by construction rather than by validation alone, and Phase 6's nonce-based CSP
does not inherit an inline-`<style>` problem.

Consequence: tokens are scoped to the wrapper, not `:root`. The wrapper must
therefore paint the page background itself (`min-height`, `background:
var(--color-paper)`), because `body` in `globals.css` reads the platform
defaults.

## Media pipeline

| Step | Decision | Rationale |
|---|---|---|
| Accept | jpeg, png, webp, **sniffed from magic bytes** | The declared `Content-Type` is attacker-controlled |
| Cap | 8 MB | Phone photos are large; smaller rejects real uploads |
| Orient | `.rotate()` **before** anything else | Applies EXIF orientation; skip it and photos land sideways once metadata is dropped |
| Strip | Re-encode to WebP | Drops all metadata including GPS |
| Resize | max 1600x1600, `fit: inside`, no enlargement | Enough for a retina card, bounded cost |
| Placeholder | 16px WebP -> base64 `blurDataUrl` | Cards must not shift as photos load |
| Key | `tenants/<tenantId>/media/<uuid>.webp` via `tenantScopedKey()` | Keys are attacker-influenced |
| Serve | `/storage/[...key]`, pattern-locked, `immutable` cache | uuid keys are content-stable |

`sharp` becomes a **direct dependency**, keeping the existing `overrides` pin to
the patched libvips line. It is currently only an override, which pins a package
the project does not actually declare.

`next.config.ts` must set `experimental.serverActions.bodySizeLimit` to `10mb`.
The default is 1 MB and would reject essentially every phone photo — a silent
failure that looks like a broken upload button.

The proxy matcher already excludes `storage/`, so the route needs no proxy
change. The route accepts only keys matching
`tenants/<uuid>/media/<uuid>.webp`; anything else is a 404 before touching the
filesystem.

### GPS stripping gets evidence

A test uploads a **real GPS-tagged JPEG fixture** and asserts the coordinates are
absent from the output. This is a privacy promise made to restaurant owners
photographing their own premises; it is verified, not commented.

## Layout presets

| Preset | Form | For |
|---|---|---|
| `grid` | Photo cards, 2-col mobile / 3-col desktop | The flagship, photo-forward |
| `list` | Phase 2 leader-rule row, preserved exactly | 90-item menus with no photography |
| `editorial` | Single column, larger type, description-forward | Upscale |

**Grid degrades honestly.** An item with no photo renders a name+price card, not
an empty box, so a half-photographed menu looks intentional rather than broken.
This is the difference between the preset being usable by a real client and being
a demo-only trick.

Sticky category nav and instant search are preset-independent and already work.

RTL mirroring applies to every preset. Prices stay Latin digits with
`dir="ltr"` on numeric runs.

### Card content contract

`ItemRow` already renders description, variants, badges, and struck-through
sold-out state. **None of that is dropped.** The "price only" decision was about
*calories* specifically — no nutrition column is added, because that data does
not exist in this market and an empty slot reads as broken.

Each preset renders the same data at a different density:

| Field | `grid` | `list` | `editorial` |
|---|---|---|---|
| Photo | yes, 4:3, `next/image` + blur | no | yes, wide |
| Name | yes | yes | yes, large |
| Price | yes | yes, on the leader baseline | yes |
| Description | clamped to 2 lines | full | full |
| Variants | inline under price | inline list | inline list |
| Badges | yes | yes | yes |
| Sold out | struck through + dimmed photo | struck through | struck through |
| Calories | never | never | never |

Sold-out styling stays consistent across presets: the dish remains on the menu,
struck through, the way a server crosses a dish off a board. In `grid` the photo
additionally desaturates, because a full-colour photo beside struck-through text
reads as a rendering bug.

### Logo placement

The logo replaces the restaurant name in the site header when set, with the name
kept as the `alt` text so the page still says who it is to a screen reader and to
search engines. Capped at 40px tall so a large upload cannot push the menu below
the fold — the menu being immediately visible is the Phase 2 decision this
feature must not break. With no logo set, the header renders exactly as it does
today. No hero is introduced in any preset.

## Admin

Route: `/admin/[tenantId]/theme`.

| Control | Owner | Platform admin |
|---|---|---|
| Curated palette (5) | yes | yes |
| Font pairing (3) | yes | yes |
| Layout preset (3) | yes | yes |
| Logo upload | yes | yes |
| Per-token colour pickers (7) | no | yes |

Live preview renders the **real** `ItemCard` / `ItemRow` components inside a
wrapper carrying the candidate theme. No iframe, no round-trip, and accurate
because it is the same code the public site runs.

Every Server Action calls `requireMembership` itself — a layout guard does not
run when an action is invoked directly, and `tenantId` arrives from the client.
Per-token colour access additionally checks `isPlatformAdmin`; an owner posting
token overrides directly must be refused by the action, not merely by a hidden
control.

No `redirect()` from any admin Server Action. Return a target; the client calls
`window.location.assign()`.

## Corrections to existing code

1. **Delete the `prefers-color-scheme: dark` block from `globals.css`.** Once an
   owner picks a palette, that block silently overrides it on any device in dark
   mode. The owner sees their cream-and-green site render dark and concludes the
   product is broken. Tenant palette wins outright.
2. **Correct the `theme_settings` schema comment** to the real token names.
3. **Add `sharp` as a direct dependency.**

## Testing

Unit (`core/`, no database):

- Contrast ratios against known WCAG reference pairs (black/white = 21:1)
- Every shipped palette passes its own blocking rules
- Hex validation rejects `red`, `#fff`, `rgb(0,0,0)`, and
  `#000;} body{background:url(x)`
- `css.ts` throws on an unknown token key
- Theme resolution: default <- curated <- overrides, including partial overrides
- Magic-byte sniffing rejects a renamed `.exe` and an SVG
- Size cap rejects an oversized buffer

Integration (real PostgreSQL):

- Theme and media repositories are tenant-scoped; RLS holds with the repository
  layer bypassed
- EXIF/GPS stripped from a real tagged fixture
- EXIF orientation applied — a rotated fixture comes out upright

E2E (Playwright, admin specs serial):

- Change palette in admin -> public site renders the new colours
- Contrast-failing palette is refused, with the failing pair named
- Upload a photo -> it appears on the item card
- Switch preset -> grid and list render measurably different DOM
- Owner cannot save per-token overrides; platform admin can

## Blocking verification steps

These are the claims that must be proven by running the product, not by
typechecking. Nothing here is "done" until each is observed:

1. **Only one display font family downloads** on a tenant page, in the browser
   network panel. If three download, the font design is wrong and must change.
2. **A real photo uploads end to end** from the admin on a phone-sized viewport
   and appears on the public card.
3. **A GPS-tagged photo comes out with no coordinates**, read back from the
   stored file.
4. **A contrast-failing palette is actually refused** by the Server Action when
   posted directly, not just disabled in the UI.
5. **Both locales render** in every preset, with prices Latin and correctly
   ordered under RTL.

## Risks

| Risk | Mitigation |
|---|---|
| Three font families download, blowing the perf budget | Verified in the network panel before the preset work is called done; fallback is a single pairing |
| `sharp` native binary fails on Windows | It is already in the tree via Next; a smoke test on real bytes runs first |
| Owner uploads 90 photos and storage balloons | 1600px cap and WebP re-encode bound per-image cost; quota is an R5 billing concern |
| Grid looks broken for a no-photo client | `list` remains the default preset; grid degrades to name+price cards |
| Palette overrides outlive a curated palette's redesign | Overrides are per-token and sparse, so untouched tokens follow the platform |
