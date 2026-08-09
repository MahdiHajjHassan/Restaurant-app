# Deployment plan — for review

**Date:** 9 August 2026
**Status:** Proposal. Nothing here is built or bought yet.
**Reviewer:** please read "Open questions" at the end first — that is where I most want a second opinion.

---

## Plain-language summary

The software is finished for its first release. An operator can create a
restaurant in a browser, the restaurant's owner can build their menu, and a
customer can read it. None of that requires a developer.

What does not exist is a **server**. Everything runs on one laptop, so no
customer can reach anything. This document proposes how to put it online, what
it costs, and what has to be built first.

The recommendation is a **rented server at roughly $5/month** rather than a
managed platform at roughly $25–40/month — not primarily to save money, but
because the managed route requires rewriting how photos are stored before
anything can go live at all. The trade-off is that we would own a server, with
the maintenance that implies.

**Nothing below is reversible-by-accident.** No account has been opened, no
domain bought, no payment details entered anywhere.

---

## What the application is

| | |
|---|---|
| Runtime | Next.js 16.2.12, React 19, Node ≥ 20.9 |
| Database | PostgreSQL 17, accessed via `node-postgres` (TCP, not an HTTP driver) |
| Tests | 230 unit/integration against a real PostgreSQL, 126 browser tests |
| Shape | Multi-tenant: one codebase serving many restaurant websites, resolved by `Host` header |

Each restaurant gets `<slug>.<platform-domain>` for free, and may later attach
its own domain. The admin console is served from `app.<platform-domain>` — a
separate origin, deliberately, so session cookies never touch a tenant's site.

---

## Three constraints that rule out most hosting advice

These are not preferences. Each one is load-bearing, and each is enforced by a
test that would fail if it were quietly broken.

### 1. Uploaded photos are written to local disk

`src/server/storage.ts` supports one driver. The other is a `throw`:

```ts
case "r2":
  throw new Error("The R2 storage driver is not implemented yet. Set STORAGE_DRIVER=local.");
```

Most modern platforms (Vercel, and containers without a mounted volume) have an
**ephemeral filesystem**. Every deploy would silently delete every restaurant's
photographs. `.env.example` already names Cloudflare R2 as the production
intent, so this was always known — it simply has not been built.

**Consequence:** either the host provides a persistent volume, or the R2/S3
driver gets written before launch. This single fact drives the recommendation
more than cost does.

### 2. The database needs two roles, one deliberately powerless

Tenant isolation has two independent layers. The second is PostgreSQL
Row-Level Security, and it **fails open**: if the application's role ever gains
`BYPASSRLS` or superuser, every policy silently stops applying and every test
still passes.

So the application connects as `app_user` — `NOBYPASSRLS`, DML only, cannot
drop a policy — while migrations run as a separate owner role. This is asserted
on every CI run in `tests/integration/db.test.ts`.

**Consequence:** the database service must permit creating custom roles and
granting them precisely. A service that hands over a single all-powerful
connection string removes a layer this product's core promise depends on.

### 3. Every restaurant needs HTTPS on its own hostname, issued automatically

Two categories:

- `<slug>.<platform-domain>` — covered by one **wildcard certificate**.
- A restaurant's own domain — needs a certificate issued **on demand**, at the
  moment they point DNS at us, without anyone editing configuration.

Caddy solves the second case natively: before issuing, it asks our application
whether a hostname is legitimate. That maps exactly onto the `domains` table
and its `verifiedAt` column, which already exists and already governs whether a
hostname serves at all.

**Consequence:** whichever host we choose must let us answer that question, or
we are adding certificates by hand for every client.

---

## The two routes

### Route A — rented server (recommended)

Hetzner CX22: 2 vCPU, 4 GB RAM, ~$4.51/month. Running the app, PostgreSQL and
Caddy on one machine, deployed via Coolify or plain Docker Compose.

**For**
- Persistent disk, so **constraint 1 needs no code at all**.
- Full PostgreSQL, so constraint 2 works exactly as designed and tested.
- Caddy handles constraint 3, including the "ask the app" hook.
- ~$60/year all in, against ~$300–480/year for Route B.
- Nothing about the application changes, so what goes live is what the 356
  tests already cover.

**Against**
- We own a server: OS patching, backups, and no support line during an outage.
- Single point of failure. No standby, no automatic failover.
- PostgreSQL shares a box with the application; `sharp` image processing is
  memory-hungry and 4 GB is adequate rather than generous.
- Realistically fine at 5 clients; becomes a genuine job somewhere before 50.

### Route B — Vercel + managed database + object storage

Vercel Pro at $20/user/month, plus a managed PostgreSQL, plus R2/S3.

**For**
- No server to maintain; deploys, scaling and certificates are somebody else's
  problem.
- Per-tenant custom domains are a supported product feature.
- Cleaner path beyond ~50 clients.

**Against**
- **Requires writing the R2 storage driver before anything can go live**, plus
  migrating existing uploads. That is real work with real failure modes, and it
  is on the critical path.
- Managed PostgreSQL varies in whether it permits the role separation in
  constraint 2. This needs verifying per provider, not assuming.
- 5–8× the running cost while there is no revenue.

### Recommendation

**Route A**, on the reasoning that it is the only one where the thing we deploy
is the thing we tested, and the DNS verification deliberately left unbuilt in
Phase 5 becomes straightforward rather than a second project.

If the reviewer's judgement is that a non-technical owner should not be
responsible for a server at all, that is a legitimate reason to accept Route B's
cost and extra work, and I would not argue hard against it. See open question 1.

---

## Work required before going live

Ordered. Items marked **(A)** apply only to the rented-server route,
**(B)** only to Vercel.

| # | Item | Notes |
|---|---|---|
| 1 | Choose and buy a domain | **Owner's decision.** Branding, not engineering |
| 2 | `output: "standalone"` in `next.config.ts` + Dockerfile | Absent today; needed for a lean image **(A)** |
| 3 | R2/S3 storage driver + upload migration | **(B) only.** The reason B is slower to launch |
| 4 | Caddy config: wildcard TLS + on-demand TLS **(A)** | Wildcard needs DNS-01, so an API token from the registrar |
| 5 | TLS "ask" endpoint | New route handler answering from `domains.verifiedAt`. Must be locked down — an open endpoint here is a certificate-issuance abuse vector |
| 6 | Real DNS verification in `attachDomain` | Finally possible: there is an address to point at. Replaces today's manual toggle |
| 7 | Production database bootstrap | `bootstrap.sql`, `grants.sql`, migrations as owner. Verify `NOBYPASSRLS` holds in production, not just CI |
| 8 | Secrets management | The two database URLs and `PLATFORM_DOMAIN`. There is no session-signing secret to manage: session tokens are random and only their SHA-256 hash is stored, so a database leak yields nothing presentable as a session |
| 9 | First operator account | `scripts/create-admin.ts --platform-admin`, once, then never again |
| 10 | **Backups with a tested restore** | `pg_dump` on a schedule, off the machine, **plus the photo directory** on Route A. A restore that has never been performed is not a backup |
| 11 | Deploy pipeline | Build, run all 356 tests, deploy on green. Never deploy an untested tree |
| 12 | Uptime monitoring + error tracking | Sentry is Phase 6; something must page us before a client notices |
| 13 | Security review | Before public exposure, not after |
| 14 | ~~Lighthouse at realistic menu size~~ | **Done, 9 Aug 2026.** Every preset ≥95 mobile at 90 dishes, both languages. Adds one deploy step: warm the image cache before sending traffic |

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Photos lost on deploy | **Critical** | The whole point of constraint 1. Route A avoids it structurally; Route B must build storage first |
| RLS role separation not reproduced in production | **Critical** | Assert `NOBYPASSRLS` against the production database as a deployment step, not only in CI |
| Backup exists but restore has never been run | **High** | Rehearse a full restore into a scratch database before the first client, and again quarterly |
| Single server dies | **High** on Route A | Documented rebuild procedure + offsite backups. Accepted consciously at this scale; see open question 2 |
| TLS "ask" endpoint abused to issue certificates | Medium | Answer only for hostnames already in `domains`; rate-limit; Let's Encrypt caps apply per registered domain |
| Latency from EU datacentre to Lebanon | Low | ~60–90ms. The budget has now been measured and the server answers in 5ms; what the budget is spent on is payload, not round trips |
| First visitor after a deploy gets a cold image cache | Medium | Measured at 9 Lighthouse points. Warm it as a deploy step; see open question 4 |
| No password reset exists | Medium | See open question 3 — this is the one I most expect to bite |

---

## Explicitly out of scope

- **High availability.** One server, no standby. Deliberate at this scale.
- **Autoscaling.** A 90-item menu for five restaurants is not a scale problem.
- **Custom CSS per client** and **automatic DNS verification** were deliberately
  left unbuilt in Phase 5; item 6 above closes the second one.
- **Email.** There is no email adapter at all. This is not a deployment task,
  but it becomes a support problem the day there is a real client — see below.

---

## Open questions for the reviewer

**1. Is a rented server the right call for a non-technical owner?**
Route A is cheaper, needs no new code, and fits the architecture. It also means
the owner is responsible for a machine. I judged the maintenance real but
manageable at five clients, with a documented rebuild and tested backups. A
second opinion on that judgement is the single most useful thing this review
could produce.

**2. What downtime and data loss are actually acceptable?**
I have assumed: a few hours to rebuild from backup, and at most 24 hours of
data lost, is tolerable for a five-restaurant menu platform. If the honest
answer is lower, Route A needs streaming backups or Route B becomes correct.

**3. Going live with no password reset.**
There is no email adapter, so a restaurant owner who forgets their password
cannot recover it themselves. The operator console can create accounts but
deliberately **cannot** overwrite an existing user's password — that was closed
on purpose, because it would let anyone with console access take over any
account. The only remaining path is running a script on the production server.
That is a bad answer the first time a real client phones on a Saturday. Options:
add a "reset this owner's password" action to the console, restricted to
platform admins and audited; or build the email adapter now. **I would like a
view on which, before launch rather than after.**

**4. ~~Should the performance budget be measured before or after launch?~~
ANSWERED — measured before, on 9 August 2026.**
A 90-dish menu with a photograph on every dish clears **≥95 on mobile in every
layout and both languages**: editorial 98, list 97, grid 96. Grid began at 83
and list at 90. Full numbers and how to reproduce them are in `docs/STATUS.md`.

Two findings that change deployment work rather than application code:

- **A cold image cache costs 9 points** (88 against 97). Next resizes on demand
  and a deploy wipes the cache, so the first visitor pays. `warm-images.mjs`
  renders the 360 renditions in about 15 seconds and belongs in the deploy
  script, before traffic is sent. This matters more on the target box than it
  did here: 4 GB of RAM shared with PostgreSQL, and `sharp` is memory-hungry.
- **Latency from an EU datacentre is not the constraint the risk table assumed.**
  The server answers in 5 ms; the budget is spent on payload, not round trips.

**5. Is anything in "constraints" wrong?**
Each is drawn from code and tests in this repository, cited above. If any is
overstated, the recommendation may change — particularly constraint 2, which is
what most narrows the field of managed database options.

---

## What happens next, and who does it

| Step | Who |
|---|---|
| Review this document, answer the open questions | Reviewer |
| Choose and buy a domain name | Owner |
| Open the hosting account, enter payment details | Owner |
| Everything else in the work table | Me, with verification at each step |

I will not open accounts, buy domains, or enter payment details. Those need to
be the owner's, in the owner's name, on the owner's card.

---

## Sources for the pricing and capability claims

Prices were checked in August 2026 and are approximate; they should be
re-checked at the point of purchase rather than trusted from this document.

- Hetzner CX22 pricing — [bestusavps.com/reviews/hetzner](https://bestusavps.com/reviews/hetzner/)
- Vercel plan pricing — [vercel.com/pricing](https://vercel.com/pricing)
- Managed PostgreSQL comparison — [bytebase.com](https://www.bytebase.com/blog/postgres-hosting-options-pricing-comparison/)
- Caddy on-demand TLS and the `ask` hook — [caddyserver.com/on-demand-tls](https://caddyserver.com/on-demand-tls)
- Wildcard TLS via DNS-01 for multi-tenant systems — [skeptrune.com](https://www.skeptrune.com/posts/wildcard-tls-for-multi-tenant-systems/)

Claims about this application's own behaviour are drawn from the repository and
are checkable there: `src/server/storage.ts` (single driver), `.env.example`
(role separation and its rationale), `tests/integration/db.test.ts` (asserts the
runtime role cannot bypass RLS), `src/core/db/schema.ts` (`domains.verifiedAt`),
`src/app/admin/operator/actions.ts` (create-restaurant never overwrites an
existing password).
