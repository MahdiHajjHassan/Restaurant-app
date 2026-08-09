# Console redesign — design

**Date:** 9 August 2026
**Status:** Approved, ready to plan.
**Scope:** The admin and operator console only. The public menu is untouched.

## The diagnosis

The console is wearing the menu's clothes.

Every screen beneath `/admin` is built from the design tokens made for the
*public menu* — `--color-paper`, `--color-ink`, `--color-muted`,
`--color-rule`, and the `font-display` menu face. Those were chosen to make a
customer feel they are reading a printed page at a counter: quiet, warm, low
contrast, no chrome. That decision is right, and the measured 96–98 Lighthouse
scores say so.

It is exactly wrong for a tool. What it produces, concretely:

- **Status is invisible.** `active`, `trial` and `suspended` all render as the
  same grey outlined pill. The most important fact about a restaurant in the
  list is the one you cannot see.
- **Nothing has a size.** Page headings are `text-lg`; body text is `0.95rem`.
  With almost no difference, nothing leads the eye.
- **Nothing looks clickable.** List rows are bare text separated by hairlines.
- **Errors look like notes.** A failed login renders in the same grey-bordered
  box as everything else.
- **No surfaces.** No cards, no panels, no grouping — one flat background.
- **Squeezed into `max-w-2xl`/`max-w-3xl`** on a desktop, where operators work.

So the console was not designed badly. It was never designed; it inherited a
design meant for something else.

## What this is not

The customer-facing menu is out of scope. It is fast, deliberate, and asserted
on by most of the browser suite. "The menu is the homepage", the dotted leader
rule, sold-out dishes struck through rather than removed, prices in Latin digits
— all stay exactly as they are.

## Design

### 1. A separate token set, scoped so it cannot leak

The admin root element carries a `console` class. Inside it, a new token set
defined in `globals.css`:

| Token | Role |
|---|---|
| `--c-bg`, `--c-surface`, `--c-surface-sunk` | page, raised panel, inset well |
| `--c-text`, `--c-text-muted`, `--c-text-subtle` | three levels, real contrast |
| `--c-border`, `--c-border-strong` | hairline and emphasis |
| `--c-brand`, `--c-brand-fg`, `--c-brand-soft` | primary actions |
| `--c-ok`, `--c-warn`, `--c-danger` (+ `-soft` backgrounds) | status and errors |

**Named `--c-*`, never `--color-*`.** Two hard reasons:

1. The public site's tokens must stay untouched, so the performance work and
   the menu's design hold.
2. `admin-theme.spec` finds the theme editor's live preview with
   `page.locator("[style*='--color-accent']").last()`. Any new inline style in
   the console mentioning `--color-accent` would capture that selector and
   break the test — so console tokens live in a stylesheet class, not inline
   styles, and use a different prefix.

The console is deliberately a **light, high-contrast** surface rather than the
menu's warm paper: it is a workspace, read under kitchen lights and in
daylight, and contrast is what makes a dense list scannable.

### 2. A kit of parts, in `src/ui/console/`

Today every screen hand-rolls `rounded-md border border-[var(--color-rule)]
px-3 py-2.5 text-[0.95rem]`. Six components replace that:

| Component | Responsibility |
|---|---|
| `Button` | `primary` / `secondary` / `danger` / `ghost`, two sizes, pending state |
| `Panel` | a raised surface, optional title and description |
| `Field` | label + control + hint + error, wired consistently |
| `StatusBadge` | tenant status → colour and word |
| `PageHeader` | title, description, and an actions slot |
| `EmptyState` | icon-free explanation plus one primary action |

This is the "easy to work on" half of the request: a new screen is composed
from named pieces rather than hand-styled, and a change to how inputs look
happens in one file.

`src/ui/console/` sits beside the existing `src/ui/menu/` and `src/ui/site/`,
so it follows the structure already there. These are presentational components
and import nothing from `core/`.

**No component library.** A day was just spent taking bytes off this product;
adding a UI framework to it would be an odd way to follow that.

### 3. Screen by screen

Presentation changes only — see the constraint below.

- **Login** — a centred card on a plain field, real heading hierarchy, the
  error in `--c-danger` rather than a grey box.
- **Operator restaurant list** — wider container, a proper row layout with
  name / address / status columns on desktop and a stacked card on a phone,
  **coloured status**, and "New restaurant" as a primary button in the header.
- **Create restaurant** — three grouped panels (the restaurant, its owner, the
  demo menu) instead of one undifferentiated column.
- **Restaurant detail** — status control, domains and impersonation as
  distinct panels rather than stacked prose.
- **Owner menu editor** — sections as panels; dish rows with comfortable touch
  targets; quick-add visually marked as the "type here" affordance, because it
  is the single most used control in the product.
- **Dish page, hours, theme** — rebuilt on `Field`, `Panel`, `Button`.
- **Impersonation banner** — genuinely loud, in `--c-warn`.

### 4. Mobile

Owners edit the menu standing in a kitchen, one-handed. Touch targets ≥44 px,
single column, no hover-only affordances. This is the same reasoning that made
reorder buttons rather than drag.

### 5. The constraint that makes this safe

**Change presentation only. Never text, labels, roles, or ARIA.**

126 browser tests find elements by accessible name and role — 16 `button`,
7 `status`, 5 `heading`, 4 `switch`, 4 `link`, 3 `alert`, 1 `img`. Therefore:

- Every button keeps its exact words: "Save changes", "Sign in", "Add", …
- `role="status"` on success messages and `role="alert"` on errors stay.
- The availability control stays a `switch` with `aria-checked`.
- The theme preview keeps its inline `--color-accent` style and stays the
  **last** element in the document carrying one.
- Sold-out dish names keep `line-through` in the admin list — asserted.
- Heading levels and accessible names stay as they are.

Classes and layout are fair game. Meaning is not.

## Verification

- Every screen loaded and clicked through in a browser, at desktop and phone
  widths, signed in as both an operator and an owner.
- `npm run verify` green.
- `E2E_PORT=3100 npm run test:e2e` green twice consecutively.
- **Lighthouse re-run on the public menu.** The console shares `globals.css`,
  so the redesign could quietly put weight back onto customer-facing pages.
  Grid and list must stay ≥95.

## Done

Merged to `main` and pushed, branch deleted, `docs/STATUS.md` updated to
describe the console's design language so the next person extending it knows
which parts to reach for.
