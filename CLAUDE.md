# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Starting a session? Read [`docs/STATUS.md`](docs/STATUS.md) first.** It says
> where the project stands, what is blocking a sale, and what to do next — in
> about two minutes. Keep it current when you finish a phase; a status file that
> lies is worse than none.

## What this is

A multi-tenant white-label platform: one codebase serving many restaurant websites. Each restaurant is a tenant with its own domain, theme, and bilingual (English/Arabic) menu. Roadmap and locked product decisions live in `docs/roadmap.md`.

Currently at the end of **Phase 5** (operator console: create a restaurant, its subdomain and its owner's login from a browser; suspend; attach domains; impersonate for support), on top of Phase 4c menu CRUD, Phase 3 theming and the 4b media pipeline.

**The next thing that matters is not code: nothing is deployed.** There is no domain and no host, so no customer can reach a site. Every piece of onboarding software exists and is tested end to end; automatic DNS verification is deliberately unbuilt because there is no address to tell anyone to point at (see `attachDomain` in `core/platform/repository.ts`, which is the seam).

The admin is served from `app.<PLATFORM_DOMAIN>` — locally `app.localhost:3000`. `create-admin.ts` is for the **first operator only**; every restaurant after that is created at `/operator`:

```bash
node scripts/create-admin.ts you@example.com yourpassword alpha-grill owner --platform-admin
```

## Branch workflow

Feature work happens on a branch, never directly on `main`.

**Clean up behind you.** Once a branch is merged into `main` and pushed, delete
it — locally and on the remote. Stale branches accumulate into a list nobody
trusts, and then nobody can tell which ones still matter.

```bash
npm run verify && npm run test:e2e   # on the branch, before merging
git checkout main && git merge <branch>
npm run verify                       # again, on the MERGED result
git push origin main
git branch -d <branch>
git push origin --delete <branch>    # only if it was ever pushed
```

Verify twice on purpose: a green run only proves the tree it ran on, and the
merged tree is not the tree you tested.

## Commands

```bash
npm run dev          # dev server on :3000
npm run verify       # typecheck + lint + test — run this before claiming done
npm run test         # Vitest (unit + integration)
npm run test:e2e     # Playwright (chromium + mobile)
npm run build
```

The browser suite reuses a server already listening on its port — including a
`npm run dev` running another branch, which it will then report as a pass. Give
it its own server:

```bash
E2E_PORT=3100 npm run test:e2e
```

Run a single test file: `npx vitest run src/core/storage/types.test.ts`
Run one e2e test: `npx playwright test -g "serves the home page"`

Database (PostgreSQL 17 local, service `postgresql-x64-17`):

```bash
npm run db:generate     # generate migration from schema changes
npm run db:migrate      # apply migrations to DEV (runs as the owner role)
npm run db:migrate:test # same, against the test database
npm run db:seed         # demo tenants — needed for the e2e suite
npm run db:seed:media   # placeholder dish photos, so the grid preset demos
npm run db:studio
```

The browser suite also needs image fixtures and a platform operator account:

```bash
npm run fixtures
node scripts/create-admin.ts operator@platform.test demo-password-123 alpha-grill owner --platform-admin
```

Seeded tenants resolve at `alpha-grill.localhost:3000`, `beta-bistro.localhost:3000` (Arabic default, LBP), `gamma-cafe.localhost:3000` (suspended), and `unverified.localhost:3000` (must 404). Chromium maps any `*.localhost` to loopback, so these work with no hosts-file editing.

One-time setup on a fresh machine, after copying `.env.example` to `.env.local`:

```bash
psql -U postgres -h localhost -f scripts/db/bootstrap.sql
psql -U postgres -h localhost -d restaurant_platform_dev  -f scripts/db/grants.sql
psql -U postgres -h localhost -d restaurant_platform_test -f scripts/db/grants.sql
```

`psql` is not on PATH by default — it lives in `C:\Program Files\PostgreSQL\17\bin`.

## Architecture

**`src/core/` is framework-agnostic and must stay that way.** Importing `next/*`, `react`, or `react-dom` from `core/` is an ESLint error, enforced in CI. This is not style: the roadmap's mobile app (R4) imports these same modules from React Native, and that only remains possible if the boundary is mechanical. Dependencies point inward — `app/` and `ui/` may import `core/`, never the reverse.

`core/` exposes **factories that receive their configuration**; it never reads `process.env`. Environment loading is a composition-root job, done in `src/env.ts` and wired in `src/server/`.

```
src/
  core/      pure TypeScript: db, storage, and (from Phase 1) tenant/menu/theme logic
  server/    composition root — builds core factories from env, exports singletons
  app/       Next.js routes
  ui/        shared presentational components
```

**Tenant isolation has two independent layers**, because a leak between restaurants would end the product:

1. Repositories in `core/db` require a tenant context; raw DB access outside that module is banned.
2. PostgreSQL Row-Level Security beneath it. The app connects as `app_user`, which is deliberately **not** a superuser and carries `NOBYPASSRLS` — RLS fails *open*, so if that role ever gains privileges every policy silently stops applying. `tests/integration/db.test.ts` asserts those privileges on every CI run; do not weaken it.

Migrations run as the owner (`MIGRATION_DATABASE_URL`); the app only ever uses `DATABASE_URL`. `app_user` has DML rights only and cannot drop an RLS policy.

## Conventions that carry real consequences

- **Money is integer minor units** (`1250`), never floats, with the currency on the tenant. Format via `Intl.NumberFormat` so LBP gets 0 decimals and USD gets 2 — never hardcode the exponent. Prices render in Latin digits in both locales.
- **Localization is paired columns** (`name_en` / `name_ar`), with English as the fallback when Arabic is blank. A third language is a deliberate ~1 week migration, not a free addition.
- **Public tenant sites are cookie-free.** Locale lives in the URL path (`/`, `/ar`), never a cookie — cookies would break full-page CDN caching, which is what delivers the mobile performance budget. Admin is served from `app.<PLATFORM_DOMAIN>` only, so sessions stay scoped to one origin.
- **`src/proxy.ts` must not query the database.** (Next 16 renamed the `middleware` file convention to `proxy`.) It only rewrites `Host` onto the `/sites/<host>` segment; tenant resolution happens in the route, memoised per request. That prefix cannot be underscore-prefixed — Next excludes private folders from routing — so `proxy.ts` explicitly 404s any request that arrives asking for `/sites/` directly, and the matcher must not exclude dot-containing paths or that guard is bypassed.
- **Only verified domains resolve.** Anyone can point DNS at the platform; without `verifiedAt` they could serve another restaurant under a lookalike domain.
- **Opening hours** are day-segments that may cross midnight, evaluated in the tenant's IANA timezone.
- **Storage keys are attacker-influenced.** Always build them with `tenantScopedKey()`; `assertSafeKey()` rejects traversal and is covered by tests.

- **Never `Promise.all` queries that share a transaction.** A transaction is pinned to one connection and PostgreSQL cannot serve concurrent queries on it — parallelising corrupts the protocol rather than going faster. Sequential awaits inside `withTenant`.
- **Messages are plain data, never functions.** React Server Components refuse to pass functions to client components; templates use `{placeholders}` and `interpolate()`.
- **Force `dir="ltr"` on times and numeric ranges inside Arabic text.** Bidi reorders LTR runs, so `11:00–15:00, 18:00–23:00` renders as `23:00–18:00 ,15:00–11:00` — read as closing before opening.
- **`*.localhost` resolves in Chrome only.** Playwright's `request` fixture and Node use the OS resolver and will fail; hit `127.0.0.1` with an explicit `Host` header instead.
- **Never `redirect()` from a Server Action in the admin.** The admin is reached by rewriting the `app.<platform>` host onto `/admin`; `redirect()` does a *client-side* navigation that resolves the path against the app's own route tree and lands on the platform home page. Return a target and call `window.location.assign()` so a real request goes through the proxy.
- **Every admin Server Action calls `requireMembership` itself.** A layout guard does not run when an action is invoked directly, and `tenantId` arrives from the client.
- **`memberships` and `domains` are deliberately outside RLS** — both are read *before* a tenant context exists. See migration `0003`. Everything else carrying `tenant_id` must have a policy, and a test enforces that.
- **E2E isolation is by DATA, not by ordering.** `test.describe.configure({ mode: "serial" })` orders tests *within one Playwright project*. It cannot reach across projects: `chromium` and `mobile` are two independent runs of the same file, executing at the same time. Any spec that WRITES must take the `sandbox` fixture (`tests/e2e/support/sandbox.ts`), which provisions a tenant, an owner, the platform operator and login identifiers per project *and per parallel slot*, rebuilt each run. The seeded demo tenants stay read-only for the whole suite — `menu.spec`, `tenant-resolution.spec` and `theming.spec` assert against them in parallel. Do not "fix" a recurrence by dropping to `workers: 1`; that hides it and slows the specs that are genuinely parallel-safe.
- **Login rate limiting is shared state too.** `attemptLogin` counts failures per email over 15 minutes, so an address reused across projects accumulates failures and eventually answers "Too many attempts" to a test asserting on the wrong-password wording. The sandbox gives each project its own owner and its own never-registered address, and clears their attempts when it provisions.
- **A disappearing control is not confirmation that a write finished.** Buttons rendered `thing && !pending` vanish the instant submission *starts*, so waiting on their absence returns mid-flight and the next assertion races the action's transaction. Wait for the success message, which only renders once the action has returned — and for the same reason, always wait for a sign-in to leave `/login` before navigating on.
- **Optimistic UI needs a server barrier in tests, not `networkidle`.** The availability toggle flips before its Server Action returns; reloading then can be served on another connection and read the row before the transaction commits. See `actionAcknowledged` in `tests/e2e/admin.spec.ts`.
- **The browser suite reuses a server already on its port.** With a hardcoded 3000 that silently means testing whatever `npm run dev` is serving — another branch, a stale build — and reporting it as a pass. Use `E2E_PORT=3100 npm run test:e2e` to get a dedicated server.
- **Theme tokens render as a React inline `style` object, never a `<style>` tag.** Owner-supplied colours reach CSS, and React's escaping is what closes that injection surface; `themeCssVariables` re-validates and emits only known keys as the second layer.
- **`themeCssVariables` emits `--font-display` / `--font-body`, not the inner `--font-*-family`.** `globals.css` declares `--font-display: var(--font-display-family)` on `:root`, so that substitution is baked at `:root` and inherits down already-resolved — overriding the inner variable further down the tree silently does nothing.
- **`next/font` cannot pick a family at runtime**, so every display face is declared in the root layout and the theme chooses one by variable. They carry `preload: false`; the default preloads all of them, which fetched four families on every page load.
- **Palette overrides are sparse** — only tokens the owner actually changed, so an untouched token keeps following the curated palette. A named `<input type="color">` posts on every submit and would materialise all seven; the visible control is unnamed and a hidden field carries only real changes.
- **`core/platform/` takes a `Database`, never a `TenantSession`.** `tenants`, `domains`, `users` and `memberships` are read *before* a tenant context can exist and are outside RLS — so there is no policy underneath those queries and the `WHERE` clause **is** the isolation. Every statement writes its scope out, including `tenantId` alongside a domain id.
- **Platform-admin is NOT ambient access to a restaurant.** Entry requires a membership, OR platform-admin *and* actively impersonating that exact tenant. The rule is a truth table in `core/auth/impersonation.ts`; the impersonation cookie only names *which* tenant, and `users.is_platform_admin` is re-read server-side every request, so a forged cookie buys nothing.
- **Creating a restaurant never overwrites an existing user's password.** Otherwise "create a restaurant for this email" becomes "take over that account", including another operator's. Existing users are reused and the submitted password ignored.
- **An action that revokes the caller's own access cannot navigate afterwards.** Clearing the impersonation cookie removes access to the current page, and a Server Action re-renders that page as part of its response — so `requireMembership` redirects at the same moment the client navigates, and the two race. Use a route handler returning a redirect instead (`admin/operator/leave/route.ts`).
- **Build the platform subdomain with `platformSubdomain()`.** It runs `PLATFORM_DOMAIN` through `normalizeHostname`, because the `domains` table stores hostnames without a port and any other spelling is a tenant that silently cannot be reached.
- **A foreign key does NOT enforce tenant isolation.** PostgreSQL evaluates FK checks as the table owner, which bypasses RLS — so `items.category_id` and `item_variants.item_id` arriving from a client are not vetted by any policy. Every action that takes a parent id looks it up through the tenant-scoped repository first. Same reasoning already documented for `imageId`.
- **Reorder sends the full ordered list, never a "move up" delta.** Two open tabs each sending a swap interleave into an order neither owner asked for; the last full list to land is at least coherent. Ids belonging to another tenant match no row and are skipped, so a stale list degrades instead of failing.
- **`FormData.get()` answers `null` for a field a form does not contain, and Zod `.optional()` rejects `null`.** A form that omits an optional field fails with "expected string, received null" — a type complaint shown to an owner who did nothing wrong. Normalise with `optionalText()` at the action boundary.
- **Integration test files must not `TRUNCATE`.** Vitest runs test files concurrently against one database, so a truncate deletes another file's fixtures mid-run and the failure reads exactly like an isolation bug. Delete only your own slugs.
- **`getByLabel` substring-matches.** "Price (USD)" also matches "New size price (USD)", so a loose selector breaks the day a page gains a field. Use `{ exact: true }` on any label that is a prefix of another.
- **A Playwright per-wait timeout must stay well under the per-test one.** Setting both to 30s made a slow test die as an unattributed whole-test timeout instead of failing at the step that was actually stuck, which hid a real bug for two runs.
- **Only one `next dev` per directory.** Next 16 refuses a second instance regardless of port, so the browser suite cannot start its own server while a preview dev server is up — stop that one first, even when using `E2E_PORT`.
- **Do not call `setState` inside an effect** — the React compiler's lint rejects it. For a form that must clear after submitting, leave the inputs uncontrolled: React resets an uncontrolled form once its action settles, and the effect is then free to do only what lives outside React (focus, `router.refresh()`).
- **Uploads are sniffed by magic bytes**; the declared `Content-Type` is attacker-controlled and never trusted. SVG is deliberately off the allowlist — it can carry script and would be served same-origin.
- **`sharp.rotate()` runs before re-encoding.** Re-encoding drops EXIF, so applying orientation afterwards leaves every portrait phone photo sideways with the tag that would have fixed it gone. The same re-encode is what strips GPS, which is a privacy promise with a test against a genuinely tagged fixture.
- **`serverActions.bodySizeLimit` is 10mb.** The 1 MB default rejects essentially every phone photo and surfaces as a generic action error, which reads as a broken upload button.
- **`npm run db:migrate` only migrates the DEV database locally.** Use `npm run db:migrate:test` for the test database, or the integration suite runs against a stale schema.

`overrides` in `package.json` pins `sharp` and `postcss` past Next's bundled versions to patch libvips and PostCSS CVEs — this product resizes owner-uploaded photos, so those are reachable. Keep production `npm audit --omit=dev` at zero.

## Testing

Integration tests run against a **real** PostgreSQL (`restaurant_platform_test`), never mocks — RLS behavior cannot be verified against a fake. `tests/setup.ts` redirects `DATABASE_URL` to the test database so running the suite can't wipe development data.
