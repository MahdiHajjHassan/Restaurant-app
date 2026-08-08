# White-Label Restaurant Platform — Full Roadmap & Implementation Plan

## Context

The goal is a **product**, not a website. You walk into a restaurant, demo it, and if the owner buys, their site is live the same day with their menu, logo, and colors. One codebase serves every client.

The repository is empty today (README, `.gitignore`, `.gitattributes`, `.claude/`). This plan builds from zero to a platform business.

**The two facts every decision serves:**
1. The 10th client must cost nearly nothing to onboard, or the economics collapse.
2. The owner must change a price themselves without calling you, or support eats your margin.

**The commercial arc.** Each release raises what you can charge and how sticky the client is:

| Release | What you sell | Client stickiness |
|---|---|---|
| R1 Digital menu | Setup fee + small monthly | Low — they could leave |
| R2 Online ordering | Higher monthly, or % of orders | High — it's now their sales channel |
| R3 Payments | Transaction margin | Very high — money flows through you |
| R4 Mobile app | Large one-off + monthly | Very high |
| R5 Self-serve billing | Recurring, no sales call | You become a SaaS, not a freelancer |

Build in this order because each stage funds the next and each is independently sellable.

---

## Where we are — 8 August 2026

**R1 is roughly 70% built.** The product demos well and is not yet sellable, for
one specific reason named below.

| Phase | State | What exists |
|---|---|---|
| 0 — Foundation | **Done** | Next 16, TS strict, Drizzle, storage adapter, ESLint boundary, CI with a real Postgres |
| 1 — Tenant core | **Done** | Full schema, RLS policies, tenant-scoped repositories, host→tenant routing |
| 2 — Public menu | **Done** | Bilingual menu, sticky nav, instant search, contact, open-now, SEO + JSON-LD |
| 3 — Theming | **Done** | 5 palettes, 3 Arabic-ready font pairings, 3 layout presets, contrast validation |
| 4a — Admin core | **Done** | Session auth, rate-limited login, edit dishes, sold-out toggle, hours editor |
| 4b — Media | **Done** | Magic-byte validation, EXIF/GPS stripping, resize, blur placeholder, dish photos + logo |
| 4c — Menu CRUD | **Not started** | — |
| 5 — Operator console | **Not started** | — |
| 6 — Hardening | **Not started** | — |
| 7 — Commercial | **Not started** | — |

Test coverage: 194 unit/integration (against a real PostgreSQL) + 118 browser
tests across desktop and mobile.

### The one thing blocking a sale

**A restaurant owner cannot add a dish.** They can edit, price, hide and
photograph dishes that already exist — but creating one is not reachable from
the admin, and deleting one does not exist anywhere, not even in the repository.

So onboarding a client today means hand-writing SQL against their menu. That
directly contradicts the two facts this whole plan is built on: the 10th client
must cost nearly nothing to onboard, and the owner must change things themselves
without calling you. Everything else in R1 is polish next to this.

### Critical path to the first paying client

In order. Each is a prerequisite for the next being worth doing.

1. **Phase 4c — Menu CRUD.** Add and delete categories, dishes and variants;
   drag-to-reorder. Note that `deleteCategory` / `deleteItem` do not exist in
   `core/menu/repository.ts` yet, and deletion needs a decision about what
   happens to a category that still holds dishes.
2. **Phase 5 — Operator console.** Create a tenant, attach and verify a domain,
   impersonate for support. Today a new restaurant requires editing
   `scripts/db/seed.sql` by hand.
3. **Phase 6 — Hardening.** Sentry, structured logs, nonce-based CSP (the
   roadmap is right that retrofitting this is misery — theme tokens are already
   inline styles), backups with a *tested* restore, Lighthouse budget in CI.
4. **Phase 7 — Commercial.** Privacy policy, terms, Arabic help docs, pricing.

**Password reset is unbuilt and deliberately not on that list.** There is no
email adapter at all. An owner who forgets their password currently needs you to
run `scripts/create-admin.ts` to reset it — which is acceptable at five clients
and unacceptable at fifty. Build it when client count or support load says so,
not before.

### Smaller known gaps

- Seeded dish photos are **generated placeholders**, not photography. Real CC0
  images are a separate, deliberate step.
- Operator custom CSS is specified but deferred to Phase 5, with the console
  that gates it — it is the riskiest surface in theming.
- Playwright runs single-worker because the two projects share one database.
  Correctness is fine; parallelism is a pending optimisation.
- The R2 storage driver throws. Local disk only until a client goes live.

---

## Environment findings

Verified on this machine: **git 2.55 and `winget` v1.29 only.** No Node.js, no npm, no Docker, no Postgres. Phase 0 starts with installation.

**Local-first, by decision.** Development needs zero cloud accounts and no credit card. Storage sits behind a `StorageAdapter` and data behind Drizzle, so moving to Cloudflare R2 + Neon at launch is configuration, not a refactor. Accounts get created when a real client goes live.

---

## Locked decisions (R1)

| Decision | Choice |
|---|---|
| Delivery model | Multi-tenant SaaS — one platform, many restaurants |
| R1 customer scope | Browse-only menu + contact. No cart, no payments |
| Languages | English + Arabic, full RTL. Currency per tenant |
| App readiness | Framework-agnostic `core/`; REST API built when a client pays for an app |
| Theming | Theme tokens + layout presets + operator-only custom CSS |
| Sections | Menu (this *is* the home page) + Contact/Find us |
| Admin | Custom-built, not a CMS |

---

## Stack

- **Next.js 15** (App Router), **TypeScript strict**
- **PostgreSQL** + **Drizzle ORM** over node-postgres — local in dev, Neon in production (same driver, so RLS and transactions behave identically)
- **Tailwind v4** + CSS custom properties for per-tenant theming
- **better-auth** — sessions, self-hostable, native Drizzle adapter
- **Storage adapter** + `next/image` — local disk in dev, R2 in production
- **next-intl** for i18n/RTL · **Zod** at every boundary
- **Email adapter** — console/file in dev, Resend in production. Password reset needs it; nothing else in R1 sends mail
- **Vitest** (core) + **Playwright** (critical paths)
- **Sentry** + structured JSON logs
- Hosting: Vercel. Avoid Vercel-only primitives so a VPS move stays open.

---

## Architecture

**Request lifecycle:** middleware reads `Host` and does exactly one thing — rewrites to the tenant route segment. It never touches the database (middleware can run at the edge; a DB round-trip there taxes every request and couples the hot path to DB availability). Tenant resolution happens in the site layout via React `cache()` + the tagged data cache (`tenant:<host>`) → server component queries Postgres → theme tokens injected as CSS variables on `<html>` → full response cached per tenant. Admin writes call `revalidateTag` for that tenant only.

**Public sites are cookie-free.** No sessions, no locale cookie, nothing — locale lives in the path (`/` default, `/ar` alternate). Cookie-free pages are trivially CDN-cacheable end to end, which is what actually delivers the 4G performance budget. Bonus: no cookies, no consent banner on customer-facing sites.

**Admin lives on one dedicated host** (`app.<platform>`), never on tenant domains. Sessions and CSRF stay confined to a single origin; an owner with two restaurants switches between them from their memberships.

```
src/
  core/          ← ZERO framework imports. Pure TypeScript.
    tenant/      resolution, settings, domains
    menu/        categories, items, variants, availability
    theme/       tokens, presets, contrast validation
    contact/     hours, location, socials
    db/          drizzle schema + tenant-scoped repositories
  app/
    (site)/      public restaurant site
    (admin)/     owner panel
    (platform)/  your operator console
    api/         thin — built at R4 for the mobile app
  ui/            shared presentational components
```

An **ESLint boundary rule** makes `core/` importing `next/*` a build error. This is the single decision that makes R4's mobile app a wrapper instead of a rewrite.

**Tenant isolation — two independent layers.** A leak here kills the product:
1. Repositories in `core/db` *require* a tenant context to construct. Raw DB access elsewhere is lint-banned, so nobody hand-writes `WHERE tenant_id`.
2. **PostgreSQL Row-Level Security** underneath. If layer 1 is ever bypassed by a bug, the database returns nothing.

RLS mechanics, pinned so it's real and not decorative: the app connects as a dedicated non-superuser role (no `BYPASSRLS`); repositories open a transaction and issue `SET LOCAL app.tenant_id = …`; every policy checks `current_setting('app.tenant_id')`. Same node-postgres driver locally and against Neon, so RLS behaves identically in dev and prod.

---

## Data model (R1)

Paired localized columns (`name_en` / `name_ar`) — simpler and faster than a translations table at two languages; blank Arabic falls back to English.

**Money is integer minor units** (`1250`, not `12.50`) plus tenant currency, formatted with `Intl.NumberFormat` — LBP renders with no decimals, USD with two; the exponent comes from the currency, never hardcoded. **Prices render in Latin digits in both locales** (`nu-latn`): the regional menu convention, and it keeps admin and public site consistent. Float money is unfixable once data exists.

Reserved subdomains (`www`, `app`, `api`, `admin`, `cdn`) are rejected at tenant creation.

| Table | Notes |
|---|---|
| `tenants` | slug, **status**, **plan**, currency, **IANA timezone**, default locale |
| `domains` | tenant → many hostnames; subdomain now, custom domain later, no migration |
| `users`, `memberships` | roles: `owner`, `staff`, platform `admin` |
| `categories` | tenant-scoped, sortable, hideable |
| `items` | bilingual name/description, photo, price, `is_available`, `is_featured`, sort, badges |
| `item_variants` | Small/Large/Family with own prices |
| `theme_settings` | 1:1 — palette, font pair, layout preset, operator-only custom CSS |
| `contact_settings` | bilingual address, coordinates, phone, WhatsApp, socials |
| `opening_hours` | one row per day-segment; segments may cross midnight (18:00–01:00) and split shifts work; "Open now" computed in the tenant's timezone |
| `media` | tenant-scoped; storage key, dimensions + blur placeholder so photos don't jump the layout |

---

## Structural bets made in R1

These cost almost nothing now and are expensive to retrofit. This is the "future vision" made concrete:

| Future capability | What R1 does so it stays cheap |
|---|---|
| Online ordering (R2) | Money in minor units; variants modeled from day one; `is_available` per item; hours as structured rows, not free text |
| Mobile app (R4) | `core/` framework-free, lint-enforced; all logic already outside React |
| Payments (R3) | Currency on the tenant; every price already per-variant |
| Multi-branch (R6) | `contact_settings` and `opening_hours` are **their own tables**, not columns on `tenants` — adding `branch_id` is a narrow migration, not a teardown |
| Custom domains | `domains` table from day one; tenant → many hostnames |
| Subscription billing (R5) | `tenants.status` + `plan` exist from day one; suspending a non-paying client is already wired |
| QR table menus (R6) | Tenant resolution is host-based *and* path-capable, so `/t/:table` slots in |

**One accepted cost, stated honestly:** paired `_en`/`_ar` columns make a *third* language a real migration (move to a `translations` table, backfill, update every query). I'm taking that trade because two languages is the actual market and a translations table taxes every query forever. If French or Turkish becomes a genuine demand, budget roughly a week.

---

# Roadmap

## R1 — Digital menu *(the sellable MVP)*

### Phase 0 — Prerequisites + foundation — **DONE**
```
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL.17
```
Then Next.js + TS strict + Tailwind v4; Drizzle against local Postgres; `StorageAdapter` with local-disk impl; ESLint boundary rule; Vitest + Playwright harness; GitHub Actions CI (typecheck, lint, test, build) with a **Postgres service container** so integration tests hit a real database, not mocks.
**Done when** `npm run dev` serves a page and CI is green.

### Phase 1 — Tenant core — **DONE**
Full schema + migrations; RLS policies; tenant-scoped repositories; host→tenant middleware with caching.
**Done when** tests prove tenant A cannot read tenant B's rows — including with the repository layer bypassed, so RLS alone holds.

### Phase 2 — Public menu site *(first demoable milestone)* — **DONE**
- Menu as home: categories, item cards, variants, sold-out state
- **Sticky category nav** — horizontal chips tracking scroll position. The menu UX pattern that matters
- Instant client-side search
- Contact: hours with live **Open now / Closed**, map, tap-to-call, WhatsApp
- Full EN/AR with RTL mirroring; locale lives in the path (`/` and `/ar`) so the public site stays cookie-free
- SEO: per-tenant metadata + JSON-LD `Restaurant`/`Menu`, per-tenant `sitemap.xml` + `robots.txt`, `hreflang` pairing between locales, per-tenant favicon and auto-generated OG image (logo + name) — this is how restaurants get found, and it sells
- Budget: **LCP < 2.0s on 4G, < 500KB initial.** Menus must work on bad signal

### Phase 3 — Theming — **DONE**
Three layout presets: **Grid** (photo-forward), **List** (compact — the realistic default for a 90-item menu with no photography), **Editorial** (upscale). Palette + font pairings from a curated set where **every pair includes a real Arabic face** (Cairo, Tajawal, IBM Plex Sans Arabic), self-hosted via `next/font`.

**Contrast validation in the theme editor** — an owner who picks navy-on-black gets warned and blocked. A theming product that lets clients make their own site unreadable is a support nightmare and an accessibility failure.

*As built:* 5 palettes and 3 pairings. Blocking applies to text pairs at AA
(4.5:1) and is enforced in the Server Action, not only by a disabled button;
a faint accent warns rather than blocks. Palette overrides are stored sparsely
so an untouched token keeps following the curated palette. Owners get the
curated sets; per-token colour entry is operator-only. Design and implementation
notes: `docs/superpowers/specs/2026-08-02-theming-and-media-design.md`.

**Deviation from the original plan, made deliberately:** the flagship look is
now the photo-forward Grid rather than the typographic List, at the product
owner's direction. List remains the default preset and the honest choice for a
long menu with no photography. That reversal is what pulled image upload forward
out of Phase 4.

### Phase 4 — Admin panel — **PARTLY DONE**
Auth (login rate-limited via a **DB-backed counter** — in-memory limiters silently reset per serverless invocation; CSRF; secure sessions; password reset through the email adapter); menu CRUD with drag-to-reorder; **one-tap availability toggle** (the control owners touch daily); image upload — validate mime, cap size, **strip EXIF** because phone photos carry GPS — with auto-thumbnail + blurhash; theme editor with live preview; hours editor. Mobile-first and bilingual: this gets used on a phone in a kitchen.

**4a — DONE.** Session auth with the DB-backed rate limiter, edit dishes,
one-tap sold-out toggle, hours editor including split shifts and segments
crossing midnight.

**4b — DONE.** Image upload: type sniffed from magic bytes rather than the
declared content type, 8 MB cap, EXIF orientation applied *before* re-encoding,
GPS stripped and verified against a genuinely tagged fixture, 1600px bound,
inline blur placeholder. Dish photos and tenant logo.

**4c — NOT STARTED, and this is what blocks a sale.** Adding a category, dish or
variant is not reachable from the admin, and deletion does not exist even in
`core/menu/repository.ts`. Drag-to-reorder is unbuilt; `sortOrder` exists and is
respected, so this is UI work rather than a migration.

**Password reset — NOT STARTED.** There is no email adapter yet. Resetting a
password today means running `scripts/create-admin.ts`.

### Phase 5 — Platform console + onboarding — **NOT STARTED**
Create tenant; attach domain with DNS-verification status UI; **impersonate for support**; set custom CSS. Plus a **seeded demo restaurant** — you need something to show owners before they've given you a single photo.

### Phase 6 — Production hardening — **NOT STARTED**
Sentry + structured logs; graceful states for unknown host / suspended tenant / DB down / image 404; automated backups with a **tested restore**; Playwright suite over client-losing paths; Lighthouse budget in CI; security headers + **nonce-based CSP from day one** (theme tokens are inline styles; retrofitting CSP onto a styled app is misery); staging environment; zero-downtime migration process.

### Phase 7 — Commercial readiness — **NOT STARTED**
Privacy policy, terms, cookie consent; owner-facing help docs **in Arabic**; onboarding checklist; pricing page; changelog. Not optional — these are what make it a business rather than a favor.

---

## R2 — Online ordering *(the value jump)* — **NOT STARTED**

Cart and checkout; pickup vs delivery; **delivery zones with per-zone fees** (map polygons); order lifecycle state machine (placed → accepted → preparing → ready → completed / rejected); live order dashboard with sound alert; order-hours enforcement so nobody orders at 3am; minimum order value; scheduled orders; WhatsApp/SMS confirmation to customer; thermal printer or PDF ticket; customer order-status page.

Cash on delivery only — payments are deliberately the next stage, not this one.

**New tables:** `orders`, `order_items` (price *snapshotted* at purchase — never join to live prices), `delivery_zones`, `order_events`.

## R3 — Payments

Per-tenant gateway configuration (Stripe internationally; local providers for MENA); checkout integration; webhook handling with idempotency; refunds; failed-payment recovery; payout reconciliation reports for the owner; **PCI scope kept minimal** — card data never touches your servers, gateway-hosted fields only.

## R4 — Mobile app

**React Native (Expo)**, consuming `core/` through a versioned REST API — the API gets built here, not before. White-label per client: their icon, splash, name. Push notifications for order status and promotions. Over-the-air updates via Expo so bug fixes skip app review. Store submission under your developer account, with a documented handover path.

**This is the payoff for the `core/` discipline.** Business logic is imported, not rewritten.

## R5 — Platform business layer

Subscription billing for *your* clients: plan tiers, free trial, dunning, automatic suspension on non-payment (`tenants.status` is already there). Self-serve signup so restaurants onboard without a sales call. Usage metering if you price on order volume. This is what converts you from freelancer to SaaS.

## R6 — Growth features

Prioritize by what clients actually ask for, not this order: multi-branch (one owner, several locations); **QR code table menus** (huge in this market, small build); promo codes; loyalty points; customer accounts + one-tap reorder; owner analytics (best sellers, peak hours, revenue trends); review collection; email/SMS campaigns.

---

## Verification

Marked with what is actually proven today, so this reads as a status rather than
an intention.

- **DONE** — `npm run typecheck && npm run lint && npm test` green (194 tests)
- **DONE** — **Unit tests on the classic traps:** open-now across midnight segments and timezones (a 18:00–01:00 Saturday shift), money formatting across currencies and both locales, EN fallback when Arabic fields are blank
- **DONE** — **Isolation test (the critical one):** seed two tenants; assert every repository method and every page route returns only the correct tenant's data; repeat with the repository layer bypassed to confirm RLS alone holds. Now also covers `theme_settings` and `media`
- **DONE** — **Playwright:** load a tenant by host and see its menu; switch to Arabic and confirm RTL mirroring; toggle sold-out in admin and watch it grey out on the public site (118 tests, desktop + mobile)
- **DONE** — Theming and media specifically: two tenants render different palettes and fonts; only the themed display face downloads; a contrast-failing palette is refused by the Server Action even when the disabled button is re-enabled from the console; a GPS-tagged portrait phone photo stores upright with no EXIF
- **PENDING** — change a price and confirm only *that* tenant's cache invalidated. Writes call `revalidatePath`, but nothing asserts the blast radius
- **PENDING** — **Lighthouse** on a seeded 90-item menu: performance ≥ 95 mobile, accessibility 100. The seed has 5 dishes, so the perf budget has never been tested at realistic menu size. Belongs with Phase 6
- **PENDING** — **Manual:** onboard the demo restaurant end-to-end and time it. **Target: under 15 minutes** from zero to a live themed site. Cannot be attempted until Phase 4c and Phase 5 exist — today it needs hand-written SQL, so the honest current time is *not measurable*

---

## Known risks

| Risk | Mitigation |
|---|---|
| Tenant data leak | Two independent layers + a test suite that attacks the boundary directly |
| Owner makes their site ugly or unreadable | Curated presets, contrast validation, custom CSS reserved to you |
| Support load per client | Arabic help docs, impersonation, an admin simple enough not to need explaining |
| Client wants to leave | Data export from day one — it's also an easier sale when leaving is possible |
| Third language demanded | Accepted cost, ~1 week, migration path documented above |
| You become the bottleneck | R5 self-serve signup is the structural fix |
