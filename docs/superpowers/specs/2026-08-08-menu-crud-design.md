# Phase 4c — Menu CRUD

**Date:** 8 August 2026
**Status:** Approved, not yet implemented

## Why this exists

This is the one thing blocking a sale. An owner can edit, price, photograph and
sell-out a dish that already exists, but cannot create one — `createCategory`
and `createItem` sit in `src/core/menu/repository.ts` with no admin route
reaching them, and delete does not exist anywhere, not even as a repository
method.

Onboarding a restaurant therefore means hand-writing SQL against their menu,
which contradicts both facts the whole product rests on: the 10th client must
cost nearly nothing to onboard, and the owner must change things themselves
without calling you.

## Two answers that shaped this

**The operator types the menu in during the sale.** So a 90-item menu has to be
enterable in one sitting. That single fact drives the main design decision
below; a separate form page per dish is what makes bulk entry miserable.

**Owners get full control — add and delete whatever.** Delete is a primary
control, available everywhere, not gated behind a role or a settings page.

## Scope

In:

- Create, rename, hide, delete and reorder **categories**
- Create, delete and reorder **dishes**, alongside the existing edit page
- Create, edit and delete **variants** (Small / Large / Family)
- Empty states for a tenant that has no menu yet
- An e2e test that builds a menu from nothing

Out, deliberately:

- **Soft delete / recycle bin.** A `deleted_at` column taxes every query
  forever and only earns its keep if deletion is constant. Retyping one dish is
  cheaper.
- **Bulk paste-a-menu import.** Tempting for onboarding speed, but parsing free
  text bilingually is error-prone and a subsystem of its own. The inline
  quick-add below gets most of the benefit. Revisit if onboarding is still the
  bottleneck after this ships.
- **Drag-to-reorder.** See the deviation below.

## The fast path is the design

A **quick-add row sits at the bottom of each category**: dish name, price,
Enter. It saves, clears, and keeps focus so the next dish can be typed
immediately. No navigation, no page load, no round trip through an edit form.

Required fields are name and price only:

- `basePriceMinor` is already `NOT NULL`, and a menu without prices is useless.
- Arabic name, description, photo, badges and variants are all optional and live
  on the existing edit page. Most of them get filled in later, or never.

A category has the same treatment: a single "Add category" input that creates
and immediately offers the next one.

**Why this matters more than it looks.** Ninety dishes through a
click → load → fill → save → back cycle is the difference between a fifteen
minute onboarding and an hour. The roadmap's under-15-minutes target is not
reachable without it.

## Delete — full control, blast radius named

Delete is reachable directly on every category and dish. No gating.

**Deleting a category cascades in the database** (`items.category_id` is
`ON DELETE CASCADE`). On a phone, one mis-tap would silently take an entire
Grills section with it. So the confirmation names the cost exactly:

> Delete **Grills** and its **14 dishes**?

Not a generic "Are you sure?". That is the whole difference between full control
and an accident. `countItemsInCategory` exists to produce that number.

**Deleting a dish** confirms inline and goes. One dish is cheap to retype.

**Deleting a variant** goes without confirmation — it is a row on a form the
owner is already editing, and its absence is immediately visible.

## Deviation from the roadmap: reorder by buttons, not drag

The roadmap specifies drag-to-reorder. This uses **up/down controls** instead.

Drag is fine on a laptop and genuinely bad on a phone: a long list, one thumb,
and a scroll gesture competing with the drag. The admin is mobile-first by an
explicit earlier decision — it gets used standing in a kitchen — so the mobile
experience wins. Buttons also work from a keyboard, are announced by screen
readers, and need no library.

`sortOrder` already exists and is respected by every query, so this is UI work
with no migration.

Revisit if owners actually ask for drag.

## Repository additions

All in `src/core/menu/repository.ts`, following the existing pattern: bound to a
tenant session, never accepting `tenantId` from the caller, and filtering on
`tenantId` in every statement even though RLS also enforces it.

| Method | Notes |
|---|---|
| `updateCategory(id, changes)` | `nameEn`, `nameAr`, `isVisible`, `sortOrder` |
| `deleteCategory(id)` | Returns the deleted row or null; dishes cascade |
| `countItemsInCategory(id)` | Feeds the confirmation's blast radius |
| `deleteItem(id)` | Returns the deleted row or null |
| `updateVariant(id, changes)` | `nameEn`, `nameAr`, `priceMinor`, `isAvailable` |
| `deleteVariant(id)` | Returns the deleted row or null |
| `reorderCategories(orderedIds)` | Writes `sortOrder` from array position |
| `reorderItems(categoryId, orderedIds)` | Same, scoped to one category |

**Reordering writes every affected row in one transaction, sequentially.** These
share a connection; `Promise.all` across them corrupts the protocol rather than
going faster.

Reorder methods take the full ordered list rather than a "move up" delta, so the
result is deterministic and a stale client cannot interleave two swaps into a
scrambled order.

## Server Actions

New actions in `src/app/admin/[tenantId]/actions.ts`, each following the rules
already established there:

- `requireMembership` called inside every action — a layout guard does not run
  for an action invoked directly, and `tenantId` arrives from the client.
- No `redirect()` — return a target and let the client call
  `window.location.assign()`.
- `revalidatePath` for the admin route after every mutation.

Actions: `createCategory`, `updateCategory`, `deleteCategory`, `createItem`,
`deleteItem`, `reorderCategories`, `reorderItems`, `createVariant`,
`updateVariant`, `deleteVariant`.

## UI

`src/app/admin/[tenantId]/page.tsx` becomes the menu builder rather than a
read-only list. Its pieces, as separate client components so each stays small:

| Component | Responsibility |
|---|---|
| `quick-add-item.tsx` | Name + price row, submits and refocuses |
| `add-category.tsx` | Single input, creates and offers the next |
| `category-header.tsx` | Rename, hide toggle, delete, move up/down |
| `item-row-controls.tsx` | Delete and move up/down, beside the existing sold-out toggle |
| `confirm-delete.tsx` | Shared inline confirmation that names what will go |

Variants get a section on the existing dish edit page, not in the quick-add row
— that row stays fast.

**Empty states.** A new tenant has no categories at all. The page says what to
do first rather than rendering an empty shell. `getPublicMenu` already filters
out categories with no dishes, so a half-built menu never reaches customers
looking broken.

## Testing

Unit (`core/`, real PostgreSQL for the repository):

- Delete returns null for another tenant's id, and the row survives
- Deleting a category removes its dishes; `countItemsInCategory` matches what
  the confirmation will claim
- Reorder assigns `sortOrder` from array position, and ignores ids belonging to
  another tenant rather than reordering nothing
- Isolation: every new method is exercised in `tests/integration/tenant-isolation.test.ts`,
  including with the repository bypassed so RLS alone is proven

E2E — the test that matters:

**Build a menu from nothing.** Start from an empty tenant, add a category, add
three dishes through quick-add, reorder one, delete one, and confirm the result
on the public site. That is the onboarding claim, so it should exist as a test
rather than as a hope.

The `sandbox` fixture provisions a tenant per project and per parallel slot; it
gains an option to provision with **no menu** so this test can start genuinely
empty. Any spec that writes uses that fixture — isolation is by data, never by
ordering.

## Risks

| Risk | Mitigation |
|---|---|
| Quick-add feels fast in a demo and slow at 90 dishes | Test it by entering a realistic menu end to end and timing it, not by trusting the design |
| Cascade delete surprises an owner | Confirmation names the exact dish count; the number comes from the database, not an estimate |
| Reorder races between two open tabs | Full ordered list rather than deltas, so the last write is coherent rather than scrambled |
| Variant UI bloats the dish page | Variants are a distinct section with their own add/delete; if it grows further it becomes its own route |
