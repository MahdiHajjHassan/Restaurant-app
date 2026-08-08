# Status — read this first

**Last updated:** 8 August 2026, after Phase 4c (menu CRUD) merged to `main`.

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

Roughly **80% built**. An owner can now run their own menu end to end. What is
still missing to make a sale is named below.

| Phase | State |
|---|---|
| 0 Foundation, 1 Tenant core, 2 Public menu | Done |
| 3 Theming | Done |
| 4a Admin core, 4b Media | Done |
| 4c Menu CRUD | Done |
| 5 Operator console | **Not started — this is the blocker** |
| 6 Hardening, 7 Commercial | Not started |

Tests: **208 unit/integration** (against a real PostgreSQL) + **122 browser**
tests across desktop and mobile.

## The one thing blocking a sale

**A new restaurant still has to be created with SQL.** The owner-facing half is
done: they can add, rename, hide, reorder and delete sections and dishes, set
sizes, and see it live immediately. What nobody can do from a browser is bring a
restaurant into existence — create the tenant, attach its domain, mark it
verified. That is still `scripts/db/seed.sql` and a `psql` session.

So onboarding is half self-service and half hand-written SQL, which still
contradicts the first fact above. **Phase 5 (operator console) is the next thing
that matters.**

### What Phase 4c actually delivered

- A **quick-add row at the bottom of every section**: dish name, price, Enter.
  It saves, clears, and keeps the cursor there for the next dish. No navigation.
- Sections: create (with an Arabic name), rename, hide, reorder, delete.
- Deleting a section **names its exact dish count first** — "Delete Grills and
  its 14 dishes?" — because it cascades. The number comes from the database.
- Dishes: delete and reorder, beside the sold-out toggle that already existed.
- **Sizes** (Small / Large) on the dish page: add, edit, remove.
- Reorder is **up/down buttons, not drag** — the roadmap asked for drag, but
  drag competes with scrolling under a thumb and this admin gets used standing
  in a kitchen. Buttons also work from a keyboard and for screen readers.

**Measured, not assumed.** 30 dishes typed through quick-add on a dev server:
median **149 ms** from pressing Enter to the row appearing, p90 177 ms, and no
slowdown as the list grew — the last dishes were as fast as the first. A 90-item
menu therefore costs about 14 seconds of waiting in total; the rest is typing
speed. That was the design's main risk, and it holds.

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

1. **Phase 5 — Operator console.** Create a tenant, attach and verify a domain,
   impersonate for support. Also the right home for operator-only custom CSS,
   which is specified but deliberately unbuilt. This is the last thing standing
   between the product and a same-day sale.
2. **Phase 6 — Hardening.** Sentry, structured logs, nonce-based CSP, backups
   with a *tested* restore, Lighthouse budget in CI.
3. **Phase 7 — Commercial.** Privacy policy, terms, Arabic help docs, pricing.

**Password reset is deliberately not on that list.** There is no email adapter at
all; resetting means running `scripts/create-admin.ts`. Acceptable at five
clients, not at fifty. Build it when support load says so.

## Known gaps, stated honestly

- Seeded dish photos are **generated placeholders**, not photography. Real CC0
  images are a separate step — ask before downloading anything.
- The Lighthouse target (≥95 mobile on a 90-item menu) has **never been tested**.
  The seed has 5 dishes. The grid preset loads a photo per dish, which makes this
  matter more than it did. Quick-add now makes a realistic 90-item menu cheap to
  build, so this is finally testable.
- **Sizes are add/edit/remove only — they do not reorder.** Small/Large/Family
  come out in creation order. Nobody has asked for more; if they do, the dish
  page is already close to needing its own route.
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
