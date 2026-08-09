# Status — read this first

**Last updated:** 9 August 2026, after the mobile performance budget was
measured at a realistic 90-dish menu and brought to 97.

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

Roughly **90% built**. The whole onboarding path now works in a browser, from
creating a restaurant to a customer reading its menu. What is missing is named
below, and it is no longer code.

| Phase | State |
|---|---|
| 0 Foundation, 1 Tenant core, 2 Public menu | Done |
| 3 Theming | Done |
| 4a Admin core, 4b Media | Done |
| 4c Menu CRUD | Done |
| 5 Operator console | Done |
| 6 Hardening, 7 Commercial | **Not started** |

Tests: **230 unit/integration** (against a real PostgreSQL) + **126 browser**
tests across desktop and mobile.

## The one thing blocking a sale

**Nothing is deployed.** There is no domain and no hosting, so no customer can
reach a site. That is now the only thing between this product and a paying
client — and it is a decision about money and accounts, not a piece of work
anyone can do for you.

Everything else is done. An operator creates a restaurant in a browser, hands
the owner a password, and the owner builds their menu. No SQL anywhere.

**This is the point to decide about hosting.** Until then the product can be
demoed on a laptop, which is enough to sell, but not to deliver.

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

### What Phase 5 delivered

- **A console at `app.<platform>/operator`**, for your platform-admin account
  only. Every restaurant, its address and its status, on one screen.
- **One form creates everything**: the restaurant, its web address (already
  verified — it is your own subdomain), the owner's login, and optionally an
  example menu to demo with. This replaces `seed.sql` *and*
  `scripts/create-admin.ts`.
- Suspend and reactivate. A suspended site explains itself rather than 404ing.
- Attach extra domains, and mark them verified by hand.
- **Sign in as an owner** for support, with an unmissable banner and a way out.

**Automatic DNS verification is deliberately not built.** It means telling a
restaurant "point your domain at this address" and then checking they did —
and with nothing deployed there is no address to name. Writing it now would
mean guessing at a target and testing against nothing. The console says so on
screen rather than showing a green tick it has not earned. The seam is one
function: `attachDomain` in `src/core/platform/repository.ts`.

**Operator-only custom CSS is also not built**, though the column exists. No
client has asked for bespoke styling, and it would create a surface the Phase 6
nonce-based CSP then has to be designed around. Adding the screen later is a
textarea and an action.

### The mobile performance budget, measured

The roadmap targets Lighthouse ≥95 on mobile. It had never been tested above 5
dishes. It now has been, on a realistic 90-dish menu with a photograph on every
dish — the worst honest case for the flagship grid preset.

| | Score | LCP |
|---|---|---|
| Editorial | **98** | 2.2 s |
| List (the default) | **97** | 2.6 s |
| Grid, English | **96** | 2.7 s |
| Grid, Arabic | **96** | 2.7 s |
| Grid, cold optimizer cache | 88 | 3.9 s |

**Every preset clears the target, in both languages.** Grid started at 83 and
list at 90. Four changes got them there, each measured on its own:

1. **The photo that is the largest paint is no longer lazy-loaded.** Every image
   in the opening viewport was `loading="lazy"` with no preload, so the six a
   customer sees first were the last ones fetched. Only the FIRST ROW is eager —
   making all six eager scored *worse* (87 against 89), because they compete
   with the first paint on a throttled connection.
2. **The font payload halved.** Seven woff2 files and 183 KB were arriving on a
   page that renders two typefaces.
3. **`fetchPriority="high"` set explicitly.** Next 16 emits it nowhere, and
   Lighthouse wants the LCP image eager *and* discoverable *and* high-priority.
4. **The language toggle stopped pulling the Arabic font onto English pages.**
   A browser fetches a webfont subset whenever any character in its range is
   rendered, so the seven characters of "العربية" were downloading the entire
   33 KB Arabic subset of the body face on every English page. That is what
   fixed the list preset, whose largest paint is text and which none of the
   image work above could reach.

Reproduce it — this needs a production build, so stop any dev server first:

```bash
npm run perf:seed                      # builds the perf-lab tenant, ~46s
npm run build && npm run perf:serve    # production, port 3200
node scripts/perf/warm-images.mjs perf-lab.localhost 3200
npm run perf:measure http://perf-lab.localhost:3200/ --runs=5 --label=grid
```

Add `--cold` to clear the image cache before every run. Reports land in
`docs/perf/`. `perf-lab` is a throwaway tenant, deliberately separate from the
seeded demo tenants, which the browser suite treats as read-only.

**The fixture is the load-bearing part.** Seeded placeholder photos are 3,132
bytes each and byte-identical; measuring against those returns a score near 100
that means nothing. The generator produces 90 distinct photograph-weight images
(mean 135 KB, 12.2 MB in total) and **refuses to finish** if they drift out of
that band, because a fixture that quietly goes lightweight turns a green
measurement into a lie that looks like good news.

Not wired into `npm run verify`: it needs a production build and a browser. A
CI budget gate belongs to Phase 6.

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

The browser suite builds for production before it runs, which is what CI and
customers get — and, it turns out, both faster and far more reliable than the
dev server it used locally. Against `next dev` it passed 4 runs in 11, failing
with a 404 on an admin page for a dish that provably existed; against a
production build, 7 for 7, at 47s a run instead of 1.7m. To iterate on a single
test without rebuilding, start `npx next start -p 3100` once and leave it up.

`create-admin.ts` is now only for the **first** operator account — the one that
gets you into the console. Every restaurant after that is created at
`app.localhost:3000/operator`, which also sets its owner's password. There is no
longer any reason to touch `seed.sql` to onboard someone.

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

1. **Deploy it.** Buy a domain, pick a host, put it online with a wildcard
   subdomain and TLS. This is a spending decision, so it needs you. Nothing
   below is worth doing first: hardening an application nobody can reach, or
   writing terms for a product with no customers, is work done in the dark.
   Once it is live, `attachDomain` becomes a real DNS check.
2. **Phase 6 — Hardening.** Sentry, structured logs, nonce-based CSP, backups
   with a *tested* restore, Lighthouse budget in CI. The budget now has a
   measured baseline and a runner to enforce it against — see above.
3. **Phase 7 — Commercial.** Privacy policy, terms, Arabic help docs, pricing.

**Password reset is deliberately not on that list.** There is no email adapter at
all; resetting means running `scripts/create-admin.ts`. Acceptable at five
clients, not at fifty. Build it when support load says so.

## Known gaps, stated honestly

- Seeded dish photos are **generated placeholders**, not photography. Real CC0
  images are a separate step — ask before downloading anything.
- **27 KB of unused framework JavaScript** is the largest remaining item in the
  audit, on every preset. It cannot go without dropping the menu search. Nothing
  currently needs it: every preset is above target with it in place.
- **`experimental.inlineCss` is off deliberately.** It measured well and broke
  the admin dish page — `Price (USD)` never renders, so an owner cannot edit a
  price. See the comment in `next.config.ts` before trying it again.
- **Cold cache costs 9 points** (88 against 97). Next resizes images on demand
  and a deploy wipes `.next/cache/images`, so the first visitor pays. Run
  `node scripts/perf/warm-images.mjs <host> <port>` after deploying — 360
  renditions in about 15 seconds — or that first customer gets the 88.
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
