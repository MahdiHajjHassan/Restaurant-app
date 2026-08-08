# Status — read this first

**Last updated:** 8 August 2026, at commit `fb6dc92` on `main`.

If you are a new session picking this up, this file orients you in about two
minutes. Then read `CLAUDE.md` for the conventions that carry real consequences,
and `docs/roadmap.md` for the full R1–R6 arc.

**Keep this file current.** When you finish a phase, update the state table, the
blocker section, and the date above. A status file that lies is worse than none.

---

## What this is

A multi-tenant white-label platform: one codebase serving many restaurant
websites. Walk into a restaurant, demo it, and if the owner buys, their site is
live the same day with their menu, logo and colours.

Two facts every decision serves:

1. The 10th client must cost nearly nothing to onboard, or the economics collapse.
2. The owner must change a price themselves without calling you, or support eats the margin.

## How the human wants to work

They are **not a developer** and cannot make technical product calls. Act as tech
lead, PM and product owner: own the decisions, and only ask them things a *user*
would know — budget, accounts, market, who they are selling to.

**Non-negotiable: run the code, don't just write it.** Every real bug in this
project so far was found by loading the page or hitting the database, never by
typechecking. Do not report something as working until you have watched it work.

## Where R1 stands

Roughly **70% built**. It demos well. It is not sellable yet, for one specific
reason below.

| Phase | State |
|---|---|
| 0 Foundation, 1 Tenant core, 2 Public menu | Done |
| 3 Theming | Done |
| 4a Admin core, 4b Media | Done |
| 4c Menu CRUD | **Not started — this is the blocker** |
| 5 Operator console, 6 Hardening, 7 Commercial | Not started |

Tests: **194 unit/integration** (against a real PostgreSQL) + **118 browser**
tests across desktop and mobile.

## The one thing blocking a sale

**A restaurant owner cannot add a dish.** They can edit, price, hide, reorder-by-
data and photograph dishes that already exist. Creating one is not reachable from
the admin, and deleting one does not exist anywhere — not even as a repository
method in `src/core/menu/repository.ts`.

Onboarding a client today therefore means hand-writing SQL against their menu,
which contradicts both facts above. Phase 4c is the smallest change that turns
this from a demo into a product. Do that before anything else in R1.

## Getting running

```bash
npm install
npm run db:migrate        # dev database
npm run db:migrate:test   # test database — separate, and easy to forget
npm run db:seed
npm run db:seed:media     # placeholder dish photos
npm run fixtures          # image fixtures the media tests need

node scripts/create-admin.ts owner@alpha-grill.test demo-password-123 alpha-grill owner
node scripts/create-admin.ts owner@beta-bistro.test demo-password-123 beta-bistro owner
node scripts/create-admin.ts operator@platform.test demo-password-123 alpha-grill owner --platform-admin

npm run dev
```

Verify with `npm run verify` then `E2E_PORT=3100 npm run test:e2e`.

The admin accounts above are for **demoing by hand**. The browser suite does not
need them: any spec that writes provisions its own restaurant and owner through
`tests/e2e/support/sandbox.ts`, per Playwright project and parallel slot, and
rebuilds them each run. The seeded demo tenants stay read-only for the whole
suite.

Use `E2E_PORT` rather than the default 3000: the suite reuses a server already
on its port, so running it while `npm run dev` is up would silently test
whatever that server is serving and report it as a pass.

**Environment gotchas that will waste your time:**

- Node and npm are not on a fresh shell's PATH. Refresh it first:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- `psql` is not on PATH either — it lives in `C:\Program Files\PostgreSQL\17\bin`.
- `npm run db:migrate` only touches the **dev** database. The test database needs
  `npm run db:migrate:test`, or the integration suite runs against a stale schema
  and fails in ways that look like application bugs.

## What is seeded

| Host | Theme | Purpose |
|---|---|---|
| `alpha-grill.localhost:3000` | crimson / modern / **grid**, 5 placeholder photos | USD, English. The flagship demo |
| `beta-bistro.localhost:3000` | **no theme row at all** | LBP, Arabic. Exercises the platform-default fallback |
| `gamma-cafe.localhost:3000` | — | Suspended: must explain itself, not 404 |
| `unverified.localhost:3000` | — | Unverified domain: must 404 |

Admin is at `app.localhost:3000` — a separate host, deliberately.

`*.localhost` resolves in **Chrome only**. Node and Playwright's `request`
fixture use the OS resolver and will fail; hit `127.0.0.1` with an explicit
`Host` header instead.

## Design direction — established, keep it

- The menu **is** the homepage. No hero, no marketing preamble. It is a reference
  document someone reads standing at a counter.
- Sold-out dishes stay on the menu, struck through, the way a server crosses a
  dish off a board. Never removed.
- Three layout presets. **Grid** (photo cards) is the flagship at the owner's
  direction; **List** (dish → dotted leader → price on one baseline) is the
  default and the honest choice for a 90-item menu with no photography;
  **Editorial** is the upscale variant.
- Prices render in **Latin digits in both locales** — the regional menu
  convention.
- Every font pairing includes a genuine Arabic face, never a Latin family with
  Arabic bolted on.

## What to do next

In order — each is a prerequisite for the next being worth doing:

1. **Phase 4c — Menu CRUD. Designed and approved, not yet built.**
   Spec: `docs/superpowers/specs/2026-08-08-menu-crud-design.md`. Start there —
   the next step is an implementation plan, not code.
2. **Phase 5 — Operator console.** Create a tenant, attach and verify a domain,
   impersonate for support. Also the right home for operator-only custom CSS,
   which is specified but deliberately unbuilt.
3. **Phase 6 — Hardening.** Sentry, structured logs, nonce-based CSP, backups
   with a *tested* restore, Lighthouse budget in CI.
4. **Phase 7 — Commercial.** Privacy policy, terms, Arabic help docs, pricing.

**Password reset is deliberately not on that list.** There is no email adapter at
all; resetting means running `scripts/create-admin.ts`. Acceptable at five
clients, not at fifty. Build it when support load says so.

## Known gaps, stated honestly

- Seeded dish photos are **generated placeholders**, not photography. Real CC0
  images are a separate step — ask before downloading anything.
- The Lighthouse target (≥95 mobile on a 90-item menu) has **never been tested**.
  The seed has 5 dishes. The grid preset loads a photo per dish, which makes this
  matter more than it did.
- Nothing asserts cache-invalidation blast radius: writes call `revalidatePath`,
  but no test proves only the edited tenant is affected.
- Storage objects from e2e uploads accumulate under the gitignored `storage/`
  directory. The `media` rows are cleaned per run; the files behind them are not.
- The R2 storage driver throws. Local disk only until a client goes live.

## Where the detail lives

| Question | File |
|---|---|
| Conventions that carry real consequences | `CLAUDE.md` |
| Full R1–R6 arc, locked product decisions, phase status | `docs/roadmap.md` |
| Why theming and media are built the way they are | `docs/superpowers/specs/2026-08-02-theming-and-media-design.md` |
| How that phase was executed, task by task | `docs/superpowers/plans/2026-08-02-theming-and-media.md` |
