# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Starting a session? Read [`docs/STATUS.md`](docs/STATUS.md) first.** It says
> where the project stands, what is blocking a sale, and what to do next — in
> about two minutes. Keep it current when you finish a phase; a status file that
> lies is worse than none.

## What this is

A multi-tenant white-label platform: one codebase serving many restaurant websites. Each restaurant is a tenant with its own domain, theme, and bilingual (English/Arabic) menu. Roadmap and locked product decisions live in `docs/roadmap.md`.

Currently at the end of **Phase 3 + 4b** (theming: palettes, font pairings, three layout presets, contrast validation; plus the media pipeline and owner image upload).

**The next thing that matters is Phase 4c — menu CRUD.** An owner cannot add a dish: create exists in `core/menu/repository.ts` but no admin route reaches it, and delete does not exist at all. Onboarding a client currently requires hand-written SQL, which is the one gap standing between this and a sellable product.

The admin is served from `app.<PLATFORM_DOMAIN>` — locally `app.localhost:3000`. Create a user with:

```bash
node scripts/create-admin.ts you@example.com yourpassword alpha-grill owner
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
- **Admin e2e tests run serially** (`test.describe.configure({ mode: "serial" })`): they mutate one shared database, and in parallel they fail on each other's writes. Note this only serializes *within* a Playwright project — `chromium` and `mobile` still run concurrently locally and can collide, so use `--workers=1` when a failure looks like a phantom. CI already sets `workers: 1`.
- **Theme tokens render as a React inline `style` object, never a `<style>` tag.** Owner-supplied colours reach CSS, and React's escaping is what closes that injection surface; `themeCssVariables` re-validates and emits only known keys as the second layer.
- **`themeCssVariables` emits `--font-display` / `--font-body`, not the inner `--font-*-family`.** `globals.css` declares `--font-display: var(--font-display-family)` on `:root`, so that substitution is baked at `:root` and inherits down already-resolved — overriding the inner variable further down the tree silently does nothing.
- **`next/font` cannot pick a family at runtime**, so every display face is declared in the root layout and the theme chooses one by variable. They carry `preload: false`; the default preloads all of them, which fetched four families on every page load.
- **Palette overrides are sparse** — only tokens the owner actually changed, so an untouched token keeps following the curated palette. A named `<input type="color">` posts on every submit and would materialise all seven; the visible control is unnamed and a hidden field carries only real changes.
- **Uploads are sniffed by magic bytes**; the declared `Content-Type` is attacker-controlled and never trusted. SVG is deliberately off the allowlist — it can carry script and would be served same-origin.
- **`sharp.rotate()` runs before re-encoding.** Re-encoding drops EXIF, so applying orientation afterwards leaves every portrait phone photo sideways with the tag that would have fixed it gone. The same re-encode is what strips GPS, which is a privacy promise with a test against a genuinely tagged fixture.
- **`serverActions.bodySizeLimit` is 10mb.** The 1 MB default rejects essentially every phone photo and surfaces as a generic action error, which reads as a broken upload button.
- **`npm run db:migrate` only migrates the DEV database locally.** Use `npm run db:migrate:test` for the test database, or the integration suite runs against a stale schema.

`overrides` in `package.json` pins `sharp` and `postcss` past Next's bundled versions to patch libvips and PostCSS CVEs — this product resizes owner-uploaded photos, so those are reachable. Keep production `npm audit --omit=dev` at zero.

## Testing

Integration tests run against a **real** PostgreSQL (`restaurant_platform_test`), never mocks — RLS behavior cannot be verified against a fake. `tests/setup.ts` redirects `DATABASE_URL` to the test database so running the suite can't wipe development data.
