# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A multi-tenant white-label platform: one codebase serving many restaurant websites. Each restaurant is a tenant with its own domain, theme, and bilingual (English/Arabic) menu. Roadmap and locked product decisions live in `docs/roadmap.md`.

Currently at the end of **Phase 0** (foundation). Phase 1 adds the tenant core.

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
npm run db:generate  # generate migration from schema changes
npm run db:migrate   # apply migrations (runs as the owner role)
npm run db:studio
```

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
- **Middleware must not query the database.** It only rewrites `Host` to a route segment; tenant resolution happens in the layout behind the tagged cache.
- **Opening hours** are day-segments that may cross midnight, evaluated in the tenant's IANA timezone.
- **Storage keys are attacker-influenced.** Always build them with `tenantScopedKey()`; `assertSafeKey()` rejects traversal and is covered by tests.

`overrides` in `package.json` pins `sharp` and `postcss` past Next's bundled versions to patch libvips and PostCSS CVEs — this product resizes owner-uploaded photos, so those are reachable. Keep production `npm audit --omit=dev` at zero.

## Testing

Integration tests run against a **real** PostgreSQL (`restaurant_platform_test`), never mocks — RLS behavior cannot be verified against a fake. `tests/setup.ts` redirects `DATABASE_URL` to the test database so running the suite can't wipe development data.
