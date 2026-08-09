# Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin and operator console its own design language and a reusable kit of parts, without changing a single word, role or ARIA attribute.

**Architecture:** A `console` class on the admin root scopes a new `--c-*` token set defined in `globals.css`. Six presentational components in `src/ui/console/` replace hand-rolled Tailwind on every screen. Screens are converted one area at a time, each independently verifiable.

**Tech Stack:** Next 16 App Router, React 19 server + client components, Tailwind 4, no new dependencies.

## Global Constraints

- **Presentation only. Never change text, labels, roles, or ARIA.** 126 browser tests find elements by accessible name and role.
- **Console tokens are `--c-*`, never `--color-*`.** `admin-theme.spec` locates the theme preview with `[style*='--color-accent']` **`.last()`**; a console inline style mentioning that variable would capture the selector.
- **The public menu is out of scope.** `src/ui/menu/`, `src/ui/site/`, and `src/app/sites/` are not touched.
- **No new dependencies.** No component library.
- **Touch targets ≥44 px** and single-column on a phone: owners edit standing in a kitchen.
- **`src/ui/` may import `core/`, never the reverse**, and must not import `next/*` beyond `next/link` and `next/image`.
- Buttons keep their exact words: "Save changes", "Sign in", "Add", "Create restaurant", "Delete", "Sign out", …
- `role="status"` on success, `role="alert"` on errors, `switch` + `aria-checked` on availability.
- Sold-out dish names keep `line-through` in the admin list (asserted in `admin.spec`).

---

### Task 1: Console tokens

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/admin/layout.tsx`

**Interfaces:**
- Produces: a `.console` class exposing `--c-bg`, `--c-surface`, `--c-surface-sunk`, `--c-text`, `--c-text-muted`, `--c-text-subtle`, `--c-border`, `--c-border-strong`, `--c-brand`, `--c-brand-fg`, `--c-brand-soft`, `--c-ok`, `--c-ok-soft`, `--c-warn`, `--c-warn-soft`, `--c-danger`, `--c-danger-soft`, `--c-radius`, `--c-shadow`.

- [ ] **Step 1: Add the token block to `globals.css`**, after the `body` rule. A workspace surface, not paper: near-white background, raised white panels, ink text at real contrast, and a blue-leaning brand distinct from the menu's bay-leaf green so the console never looks like a tenant's site.

- [ ] **Step 2: Put the class on the admin root** in `src/app/admin/layout.tsx`, replacing the bare wrapper with `className="console flex min-h-full flex-1 flex-col bg-[var(--c-bg)] text-[var(--c-text)]"`.

- [ ] **Step 3: Load `/login` and confirm the background and text colour changed**, and that `perf-lab.localhost:3000` is visually unchanged.

- [ ] **Step 4: Commit** — `git add src/app/globals.css src/app/admin/layout.tsx && git commit -m "Give the console its own tokens, scoped away from the menu"`

---

### Task 2: The kit of parts

**Files:**
- Create: `src/ui/console/button.tsx`, `panel.tsx`, `field.tsx`, `status-badge.tsx`, `page-header.tsx`, `empty-state.tsx`, `index.ts`

**Interfaces:**
- `Button({ variant?: "primary"|"secondary"|"danger"|"ghost", size?: "sm"|"md", pending?: boolean, ...button })`
- `Panel({ title?, description?, actions?, children, className? })`
- `Field({ label, hint?, error?, htmlFor?, children })` and `inputClassName` export
- `StatusBadge({ status: "active"|"trial"|"suspended"|"pending" })`
- `PageHeader({ title, description?, actions? })`
- `EmptyState({ title, description, action? })`

- [ ] **Step 1: Write the six components.** Each is a plain presentational function. `Button` forwards all native button props so existing `formAction`, `disabled`, `name` and `value` usages keep working untouched.

- [ ] **Step 2: Typecheck** — `npm run typecheck`. Expected: clean.

- [ ] **Step 3: Commit** — `git commit -m "Add the console kit: button, panel, field, badge, header, empty state"`

---

### Task 3: Login and the admin shell

**Files:**
- Modify: `src/app/admin/login/page.tsx`, `src/app/admin/login/login-form.tsx`
- Modify: `src/app/admin/page.tsx`, `src/app/admin/sign-out-button.tsx`
- Modify: `src/app/admin/[tenantId]/layout.tsx`, `src/app/admin/[tenantId]/impersonation-banner.tsx`

- [ ] **Step 1: Rebuild login** as a centred `Panel` with `Field` and `Button`. The error keeps `role="alert"` and gains `--c-danger`.
- [ ] **Step 2: Rebuild the tenant shell header** — restaurant name at real size, nav that reads as nav, `Sign out` as a secondary `Button`.
- [ ] **Step 3: Make the impersonation banner loud** in `--c-warn-soft`, keeping its text exactly.
- [ ] **Step 4: Sign in as `owner@perf-lab.test`** and confirm the shell, then sign in wrongly and confirm the error is red and still announced.
- [ ] **Step 5: Run** `E2E_PORT=3100 npx playwright test tests/e2e/admin.spec.ts --project=chromium`. Expected: pass.
- [ ] **Step 6: Commit**

---

### Task 4: The operator screens

**Files:**
- Modify: `src/app/admin/operator/layout.tsx`, `operator/page.tsx`, `operator/new/page.tsx`, `operator/new/create-form.tsx`, `operator/[tenantId]/page.tsx`, `domain-list.tsx`, `status-control.tsx`, `impersonate-button.tsx`

- [ ] **Step 1: Widen the operator layout** to `max-w-5xl` and rebuild the header with `PageHeader`.
- [ ] **Step 2: Rebuild the restaurant list** — name, address and `StatusBadge` in aligned columns on desktop, stacked on a phone, whole row clickable, "New restaurant" as a primary `Button`.
- [ ] **Step 3: Group the create form** into three `Panel`s: the restaurant, its owner, the demo menu. Field names and labels unchanged.
- [ ] **Step 4: Rebuild the detail page** as separate panels for status, domains and impersonation.
- [ ] **Step 5: Click through** the list, create a throwaway restaurant, suspend and reactivate it, attach a domain, impersonate and leave.
- [ ] **Step 6: Run** `E2E_PORT=3100 npx playwright test tests/e2e/operator.spec.ts`. Expected: pass.
- [ ] **Step 7: Commit**

---

### Task 5: The owner's menu editor

The screen that decides whether support eats the margin. Highest care.

**Files:**
- Modify: `src/app/admin/[tenantId]/page.tsx`, `add-category.tsx`, `category-header.tsx`, `quick-add-item.tsx`, `item-row-controls.tsx`, `availability-toggle.tsx`, `confirm-delete.tsx`

- [ ] **Step 1: Sections become `Panel`s**, each with its dishes.
- [ ] **Step 2: Dish rows** get ≥44 px targets, the name as the primary affordance, controls grouped to the trailing edge. Sold-out keeps `line-through` and the muted colour.
- [ ] **Step 3: Quick-add** is visually marked as the "type here" row — a sunk well at the foot of each panel, so it reads as an invitation rather than another row.
- [ ] **Step 4: Type five dishes through quick-add by hand** and confirm the cursor stays, the row appears, and nothing shifts.
- [ ] **Step 5: Run** `E2E_PORT=3100 npx playwright test tests/e2e/admin.spec.ts tests/e2e/menu-builder.spec.ts`. Expected: pass.
- [ ] **Step 6: Commit**

---

### Task 6: Dish, hours and theme screens

**Files:**
- Modify: `items/[itemId]/page.tsx`, `item-form.tsx`, `photo-field.tsx`, `variants-section.tsx`, `hours/page.tsx`, `hours-form.tsx`, `theme/page.tsx`, `theme-form.tsx`, `theme/logo-field.tsx`

- [ ] **Step 1: Convert each to `Panel` + `Field` + `Button`.**
- [ ] **Step 2: In `theme-form.tsx`, leave the live preview element alone** — its inline style carries `--color-accent` and `admin-theme.spec` finds it with `.last()`. Do not add any console element after it carrying that variable.
- [ ] **Step 3: Upload a photo, edit hours across midnight, change a palette** by hand and watch each work.
- [ ] **Step 4: Run** `E2E_PORT=3100 npx playwright test tests/e2e/admin-theme.spec.ts tests/e2e/admin-photo.spec.ts`. Expected: pass.
- [ ] **Step 5: Commit**

---

### Task 7: Verify, measure, merge

- [ ] **Step 1:** `npm run verify` — expected green, 230 tests.
- [ ] **Step 2:** `E2E_PORT=3100 npm run test:e2e` twice consecutively — expected 126 passed both times.
- [ ] **Step 3: Re-measure the public menu.** The console shares `globals.css`.

```bash
bash scripts/perf/rebuild.sh
node scripts/perf/warm-images.mjs perf-lab.localhost 3200
node scripts/perf/lighthouse.mjs http://perf-lab.localhost:3200/ --runs=5 --label=grid-90-after-console
```

Expected: ≥95. If the console's CSS has leaked onto the public pages, this is where it shows.

- [ ] **Step 4: Update `docs/STATUS.md`** with a short section naming the console's token set and the kit, so the next person extending it knows what to reach for.
- [ ] **Step 5: Merge, verify the merged tree, push, delete the branch.**
