# Phase 5 — Operator Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator create a restaurant, its subdomain and its owner's login from a browser, so onboarding a client stops requiring `psql`.

**Architecture:** A new `core/platform/` module takes a plain `Database` rather than a `TenantSession`, because `tenants`, `domains`, `users` and `memberships` are all read and written before a tenant context can exist and are deliberately outside RLS. Routes live at `/admin/operator/*`, a static segment beside `/admin/[tenantId]`. Impersonation is a cookie naming the tenant being acted as; the authorization decision stays server-side against `users.is_platform_admin`.

**Tech Stack:** Next.js 16.2.12, React 19, TypeScript strict, Drizzle + PostgreSQL 17, Zod v4, Tailwind v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-08-operator-console-design.md`

## Global Constraints

- **No migration.** Every table and column this needs already exists.
- **`src/core/` must not import `next/*`, `react`, or `react-dom`.** ESLint-enforced, CI-blocking.
- **`core/` never reads `process.env`.** Factories and functions receive config; wiring lives in `src/server/`.
- **`core/platform/` takes `Database`, never `TenantSession`** — these tables are outside RLS by design, exactly like `core/auth/repository.ts`.
- **Being a platform admin is NOT by itself access to a restaurant.** Access requires a membership, OR platform-admin *and* actively impersonating *that* tenant. This property is already asserted in the suite and must stay true.
- **An existing user's password is never overwritten** by restaurant creation. That would be a privilege-escalation path.
- **Every operator Server Action calls `requirePlatformAdmin` itself.** A layout guard does not run for an action invoked directly.
- **Never `redirect()` from an admin Server Action.** Return a target; the client calls `window.location.assign()`.
- **Never `Promise.all` queries sharing a transaction.** Sequential awaits — a transaction is pinned to one connection.
- **Hostnames are stored through `normalizeHostname()`.** A hostname saved with a port or stray casing is a tenant that cannot be reached.
- **Slugs are validated with `isValidSlug()`**, which enforces `RESERVED_SLUGS` — handing `app` to a restaurant would put their site on the admin origin, where session cookies live.
- **Money is integer minor units**; currency exponent comes from `Intl`.
- **E2E isolation is by DATA, never by ordering.** Any spec that writes provisions its own rows and cleans up after itself.
- **`npm run verify` must pass before any task is considered done.**
- **PATH first, every fresh shell:** `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- **Browser suite runs as `E2E_PORT=3100 npm run test:e2e`**, and **only one `next dev` per directory** — stop any preview server first.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/platform/repository.ts` | Restaurant/domain/owner data access, outside RLS |
| `tests/integration/platform-repository.test.ts` | New: that module against real PostgreSQL |
| `src/core/auth/impersonation.ts` | Cookie name + the access rule, as pure logic |
| `src/core/auth/impersonation.test.ts` | New: the access rule's truth table |
| `src/server/auth.ts` | `requirePlatformAdmin`; `requireMembership` honours impersonation |
| `src/server/platform.ts` | Composition: platform repository bound to `db` and `env` |
| `src/app/admin/operator/layout.tsx` | Guard + console nav |
| `src/app/admin/operator/page.tsx` | Every restaurant |
| `src/app/admin/operator/new/page.tsx` | Create form (server) |
| `src/app/admin/operator/new/create-form.tsx` | Create form (client) |
| `src/app/admin/operator/[tenantId]/page.tsx` | One restaurant: status, domains, impersonate |
| `src/app/admin/operator/[tenantId]/domain-list.tsx` | Attach / verify / remove domains |
| `src/app/admin/operator/[tenantId]/status-control.tsx` | Suspend / reactivate |
| `src/app/admin/operator/[tenantId]/impersonate-button.tsx` | Start impersonating |
| `src/app/admin/operator/actions.ts` | All operator Server Actions |
| `src/app/admin/[tenantId]/impersonation-banner.tsx` | "You are in X" bar + way out |
| `src/app/admin/[tenantId]/layout.tsx` | Render the banner |
| `src/app/admin/page.tsx` | Operators get a console link, not a dead end |
| `tests/integration/tenant-isolation.test.ts` | The impersonation access matrix |
| `tests/e2e/operator.spec.ts` | New: onboard a restaurant from nothing |

---

## Task 0: Branch and baseline

- [ ] **Step 1: Confirm the branch**

The spec was committed on `phase-5-operator-console`. Confirm you are on it:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected: `phase-5-operator-console`. If not: `git checkout phase-5-operator-console`.

- [ ] **Step 2: Confirm the baseline is green before changing anything**

Run: `npm run verify`
Expected: PASS, 208 tests. Everything below assumes a green start.

---

## Task 1: The impersonation rule, as pure logic

Doing this first, and in `core/`, keeps the product's central authorization
decision in a file with no framework, no database and no cookie parsing — so it
can be exhaustively tested as a truth table rather than through a browser.

**Files:**
- Create: `src/core/auth/impersonation.ts`
- Test: `src/core/auth/impersonation.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `IMPERSONATION_COOKIE: "operator_acting_as"`
  - `interface AccessInput { hasMembership: boolean; isPlatformAdmin: boolean; impersonatingTenantId: string | null; tenantId: string }`
  - `mayAdminister(input: AccessInput): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/core/auth/impersonation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mayAdminister } from "./impersonation";

/**
 * The product's central authorization rule, as a truth table.
 *
 * One restaurant reaching another's admin is the failure that would end this
 * product, so the rule lives here -- no database, no cookies, no framework --
 * where every combination can be enumerated rather than sampled.
 */

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("mayAdminister", () => {
  it("lets a member in", () => {
    expect(
      mayAdminister({
        hasMembership: true,
        isPlatformAdmin: false,
        impersonatingTenantId: null,
        tenantId: TENANT,
      }),
    ).toBe(true);
  });

  it("keeps a signed-in stranger out", () => {
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: false,
        impersonatingTenantId: null,
        tenantId: TENANT,
      }),
    ).toBe(false);
  });

  it("does NOT let a platform admin in merely for being one", () => {
    // The property the rest of the suite already asserts, and which the
    // console must not quietly repeal. Operating on a restaurant is a
    // deliberate act, not an ambient privilege.
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: true,
        impersonatingTenantId: null,
        tenantId: TENANT,
      }),
    ).toBe(false);
  });

  it("lets a platform admin into the tenant they are impersonating", () => {
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: true,
        impersonatingTenantId: TENANT,
        tenantId: TENANT,
      }),
    ).toBe(true);
  });

  it("scopes impersonation to ONE restaurant at a time", () => {
    // Impersonating A must not open B. Without this the cookie would be a
    // master key rather than a scoped one.
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: true,
        impersonatingTenantId: OTHER,
        tenantId: TENANT,
      }),
    ).toBe(false);
  });

  it("ignores an impersonation claim from a non-admin", () => {
    // The cookie is client-controlled, so this is the forgery case: it may
    // say anything, and it buys nothing without the server-side admin flag.
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: false,
        impersonatingTenantId: TENANT,
        tenantId: TENANT,
      }),
    ).toBe(false);
  });

  it("still lets a member in while they impersonate elsewhere", () => {
    // An operator who owns their own demo restaurant must not lose access to
    // it because they are currently helping a client.
    expect(
      mayAdminister({
        hasMembership: true,
        isPlatformAdmin: true,
        impersonatingTenantId: OTHER,
        tenantId: TENANT,
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/auth/impersonation.test.ts`
Expected: FAIL — cannot find module `./impersonation`.

- [ ] **Step 3: Implement**

Create `src/core/auth/impersonation.ts`:

```ts
/**
 * Operator impersonation.
 *
 * The operator supports clients by entering their admin and seeing exactly
 * what they see. That is a real privilege, so it is deliberate, scoped to one
 * restaurant, and visible: the tenant being acted as travels in a cookie, and
 * the admin renders a banner whenever it is set.
 *
 * The cookie is NOT the authorization. It is client-controlled and may say
 * anything; what decides access is `isPlatformAdmin`, read from the session on
 * the server for every request. A forged cookie therefore buys nothing -- it
 * only chooses WHICH restaurant an operator is already entitled to enter.
 */
export const IMPERSONATION_COOKIE = "operator_acting_as";

export interface AccessInput {
  /** This user has a membership row in `tenantId`. */
  hasMembership: boolean;
  /** From `users.is_platform_admin`, read server-side. Never from a cookie. */
  isPlatformAdmin: boolean;
  /** The tenant this session is currently acting as, or null. */
  impersonatingTenantId: string | null;
  /** The tenant being requested. */
  tenantId: string;
}

/**
 * May this user administer this restaurant?
 *
 * Being a platform admin is deliberately NOT sufficient on its own. Ambient
 * access to every restaurant is how an operator edits a client's prices
 * believing they are in the demo, and it makes the banner meaningless because
 * there is no moment at which impersonation begins.
 */
export function mayAdminister({
  hasMembership,
  isPlatformAdmin,
  impersonatingTenantId,
  tenantId,
}: AccessInput): boolean {
  if (hasMembership) return true;
  return isPlatformAdmin && impersonatingTenantId === tenantId;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/core/auth/impersonation.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/auth/impersonation.ts src/core/auth/impersonation.test.ts
git commit -m "Put the impersonation access rule in core, as a truth table"
```

---

## Task 2: Platform repository — reading restaurants

**Files:**
- Create: `src/core/platform/repository.ts`
- Test: `tests/integration/platform-repository.test.ts`

**Interfaces:**
- Consumes: `Database` from `@/core/db/client`
- Produces:
  - `interface RestaurantSummary { id: string; slug: string; name: string; status: "trial" | "active" | "suspended"; currency: string; primaryDomain: string | null }`
  - `interface RestaurantDomain { id: string; hostname: string; isPrimary: boolean; verifiedAt: Date | null }`
  - `interface RestaurantDetail extends RestaurantSummary { timezone: string; defaultLocale: "en" | "ar"; domains: RestaurantDomain[] }`
  - `listRestaurants(db: Database): Promise<RestaurantSummary[]>`
  - `findRestaurant(db: Database, tenantId: string): Promise<RestaurantDetail | null>`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/platform-repository.test.ts`:

```ts
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/core/db/client";
import {
  findRestaurant,
  listRestaurants,
} from "@/core/platform/repository";

/**
 * The operator's data access, against a real PostgreSQL.
 *
 * These tables sit OUTSIDE Row-Level Security on purpose -- a tenant, its
 * domains and its memberships are all read before any tenant context can
 * exist. That makes correctness here entirely a matter of explicit queries,
 * with no policy underneath to catch a mistake, which is why it is tested
 * against the real database rather than a mock.
 *
 * Cleanup is scoped to this file's own slugs. It must NEVER truncate: other
 * integration files run concurrently and would lose their fixtures mid-test.
 */

const PREFIX = "plat-repo";
let db: Database;
let appPool: Pool;
let adminPool: Pool;

async function reset(): Promise<void> {
  await adminPool.query("DELETE FROM tenants WHERE slug LIKE $1", [
    `${PREFIX}-%`,
  ]);
  await adminPool.query("DELETE FROM users WHERE email LIKE $1", [
    `%@${PREFIX}.test`,
  ]);
}

beforeAll(async () => {
  const appUrl = process.env.DATABASE_URL;
  const adminUrl = process.env.MIGRATION_DATABASE_URL;
  if (!appUrl || !adminUrl) {
    throw new Error("DATABASE_URL and MIGRATION_DATABASE_URL must be set");
  }
  ({ db, pool: appPool } = createDatabase({
    connectionString: appUrl,
    maxConnections: 5,
  }));
  adminPool = new Pool({ connectionString: adminUrl, max: 2 });
  await reset();
});

afterAll(async () => {
  await reset();
  await Promise.all([appPool.end(), adminPool.end()]);
});

describe("reading restaurants", () => {
  it("lists a restaurant with its primary domain", async () => {
    const { rows } = await adminPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, name, status, currency, timezone, default_locale)
       VALUES ($1, 'Plat Repo One', 'active', 'USD', 'Asia/Beirut', 'en')
       RETURNING id`,
      [`${PREFIX}-one`],
    );
    const tenantId = rows[0]!.id;
    await adminPool.query(
      `INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
       VALUES ($1, $2, true, now()), ($1, $3, false, NULL)`,
      [tenantId, `${PREFIX}-one.example.test`, `extra.${PREFIX}.test`],
    );

    const listed = await listRestaurants(db);
    const found = listed.find((row) => row.id === tenantId);

    expect(found?.name).toBe("Plat Repo One");
    expect(found?.status).toBe("active");
    // The primary, not merely the first: the console shows the operator where
    // this restaurant actually lives.
    expect(found?.primaryDomain).toBe(`${PREFIX}-one.example.test`);
  });

  it("returns one restaurant with every domain it has", async () => {
    const { rows } = await adminPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, name, status, currency, timezone, default_locale)
       VALUES ($1, 'Plat Repo Two', 'trial', 'LBP', 'Asia/Beirut', 'ar')
       RETURNING id`,
      [`${PREFIX}-two`],
    );
    const tenantId = rows[0]!.id;
    await adminPool.query(
      `INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
       VALUES ($1, $2, true, now()), ($1, $3, false, NULL)`,
      [tenantId, `${PREFIX}-two.example.test`, `custom.${PREFIX}.test`],
    );

    const detail = await findRestaurant(db, tenantId);

    expect(detail?.defaultLocale).toBe("ar");
    expect(detail?.currency).toBe("LBP");
    expect(detail?.domains).toHaveLength(2);
    const custom = detail?.domains.find((d) => d.hostname.startsWith("custom"));
    // Unverified, and therefore not resolving. The console must show that.
    expect(custom?.verifiedAt).toBeNull();
  });

  it("returns null for a tenant that does not exist", async () => {
    const missing = await findRestaurant(
      db,
      "00000000-0000-4000-8000-000000000000",
    );
    expect(missing).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/platform-repository.test.ts`
Expected: FAIL — cannot find module `@/core/platform/repository`.

- [ ] **Step 3: Implement**

Create `src/core/platform/repository.ts`:

```ts
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { domains, tenants } from "../db/schema";

/**
 * The operator's view of the platform.
 *
 * Takes a plain `Database`, never a `TenantSession` -- exactly like
 * core/auth/repository.ts, and for the same reason. `tenants`, `domains`,
 * `users` and `memberships` are all read and written BEFORE a tenant context
 * can exist, which is why they sit outside Row-Level Security (see migration
 * 0003). There is no policy underneath these queries, so every one of them
 * says explicitly what it means.
 *
 * Everything here is reachable only behind `requirePlatformAdmin`.
 */

export type RestaurantStatus = "trial" | "active" | "suspended";

export interface RestaurantSummary {
  id: string;
  slug: string;
  name: string;
  status: RestaurantStatus;
  currency: string;
  /** Where this restaurant actually lives, or null if it has no primary. */
  primaryDomain: string | null;
}

export interface RestaurantDomain {
  id: string;
  hostname: string;
  isPrimary: boolean;
  /** Null means DNS is unconfirmed, and the hostname does not resolve. */
  verifiedAt: Date | null;
}

export interface RestaurantDetail extends RestaurantSummary {
  timezone: string;
  defaultLocale: "en" | "ar";
  domains: RestaurantDomain[];
}

export async function listRestaurants(
  db: Database,
): Promise<RestaurantSummary[]> {
  /*
   * A left join on the PRIMARY domain only, rather than joining all domains
   * and picking one in memory: a restaurant with five hostnames would
   * otherwise appear five times in this list.
   */
  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      currency: tenants.currency,
      primaryDomain: domains.hostname,
    })
    .from(tenants)
    .leftJoin(
      domains,
      and(eq(domains.tenantId, tenants.id), eq(domains.isPrimary, true)),
    )
    .orderBy(asc(tenants.name));

  return rows.map((row) => ({ ...row, primaryDomain: row.primaryDomain }));
}

export async function findRestaurant(
  db: Database,
  tenantId: string,
): Promise<RestaurantDetail | null> {
  const found = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tenant = found[0];
  if (!tenant) return null;

  const hostnames = await db
    .select()
    .from(domains)
    .where(eq(domains.tenantId, tenantId))
    .orderBy(asc(domains.isPrimary), asc(domains.hostname));

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    currency: tenant.currency,
    timezone: tenant.timezone,
    defaultLocale: tenant.defaultLocale,
    primaryDomain: hostnames.find((row) => row.isPrimary)?.hostname ?? null,
    domains: hostnames.map((row) => ({
      id: row.id,
      hostname: row.hostname,
      isPrimary: row.isPrimary,
      verifiedAt: row.verifiedAt,
    })),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/integration/platform-repository.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/platform/repository.ts tests/integration/platform-repository.test.ts
git commit -m "Add the operator's read side: list and find restaurants"
```

---

## Task 3: Creating a restaurant, atomically

This is the task that removes `psql` from onboarding.

**Files:**
- Modify: `src/core/platform/repository.ts`
- Test: `tests/integration/platform-repository.test.ts`

**Interfaces:**
- Consumes: Task 2's types
- Produces:
  - `interface NewRestaurant { slug: string; name: string; currency: string; timezone: string; defaultLocale: "en" | "ar"; hostname: string; ownerEmail: string; ownerPasswordHash: string }`
  - `type CreateRestaurantResult = { ok: true; tenantId: string; reusedExistingUser: boolean } | { ok: false; reason: "slug-taken" | "hostname-taken" }`
  - `createRestaurant(db: Database, input: NewRestaurant): Promise<CreateRestaurantResult>`

**Note on hashing:** the repository takes an already-hashed password. `core/platform` must not depend on the hashing implementation, and the caller already has `hashPassword` from `core/auth/password`.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/platform-repository.test.ts`:

```ts
import { hashPassword, verifyPassword } from "@/core/auth/password";
import { createRestaurant } from "@/core/platform/repository";

describe("creating a restaurant", () => {
  it("creates the tenant, a verified primary subdomain, the owner and their membership", async () => {
    const created = await createRestaurant(db, {
      slug: `${PREFIX}-new`,
      name: "Plat Repo New",
      currency: "USD",
      timezone: "Asia/Beirut",
      defaultLocale: "en",
      hostname: `${PREFIX}-new.example.test`,
      ownerEmail: `owner@${PREFIX}.test`,
      ownerPasswordHash: await hashPassword("initial-password-123"),
    });

    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("expected creation to succeed");

    const detail = await findRestaurant(db, created.tenantId);
    expect(detail?.name).toBe("Plat Repo New");

    // The subdomain is ours, so it is verified on creation -- there is no DNS
    // for a stranger to hijack. A restaurant created without a resolving
    // hostname is one its own owner cannot see.
    const primary = detail?.domains.find((d) => d.isPrimary);
    expect(primary?.hostname).toBe(`${PREFIX}-new.example.test`);
    expect(primary?.verifiedAt).not.toBeNull();

    const membership = await adminPool.query(
      `SELECT m.role FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = $1 AND u.email = $2`,
      [created.tenantId, `owner@${PREFIX}.test`],
    );
    expect(membership.rows[0]).toEqual({ role: "owner" });
    expect(created.reusedExistingUser).toBe(false);
  });

  it("refuses a duplicate slug and leaves nothing behind", async () => {
    const input = {
      slug: `${PREFIX}-dupe`,
      name: "Plat Repo Dupe",
      currency: "USD",
      timezone: "Asia/Beirut",
      defaultLocale: "en" as const,
      hostname: `${PREFIX}-dupe.example.test`,
      ownerEmail: `dupe@${PREFIX}.test`,
      ownerPasswordHash: await hashPassword("initial-password-123"),
    };
    const first = await createRestaurant(db, input);
    expect(first.ok).toBe(true);

    const second = await createRestaurant(db, {
      ...input,
      name: "Plat Repo Dupe Two",
      hostname: `${PREFIX}-dupe-2.example.test`,
      ownerEmail: `dupe2@${PREFIX}.test`,
    });

    expect(second).toEqual({ ok: false, reason: "slug-taken" });

    // The rollback matters: a half-created restaurant with an orphan hostname
    // or user is worse than a clean refusal, because nothing in the console
    // would show it.
    const orphanDomain = await adminPool.query(
      "SELECT 1 FROM domains WHERE hostname = $1",
      [`${PREFIX}-dupe-2.example.test`],
    );
    const orphanUser = await adminPool.query(
      "SELECT 1 FROM users WHERE email = $1",
      [`dupe2@${PREFIX}.test`],
    );
    expect(orphanDomain.rowCount).toBe(0);
    expect(orphanUser.rowCount).toBe(0);
  });

  it("reuses an existing owner WITHOUT touching their password", async () => {
    /*
     * The privilege-escalation guard.
     *
     * If creating a restaurant reset the password of an email that already
     * had an account, anyone with the console could take over any account by
     * "creating a restaurant" for it -- including another operator's. The
     * schema explicitly allows a person to own several restaurants, so reuse
     * is right; rewriting their credentials is not.
     */
    const email = `existing@${PREFIX}.test`;
    const originalHash = await hashPassword("their-real-password");
    await adminPool.query(
      "INSERT INTO users (email, name, password_hash) VALUES ($1, 'existing', $2)",
      [email, originalHash],
    );

    const created = await createRestaurant(db, {
      slug: `${PREFIX}-reuse`,
      name: "Plat Repo Reuse",
      currency: "USD",
      timezone: "Asia/Beirut",
      defaultLocale: "en",
      hostname: `${PREFIX}-reuse.example.test`,
      ownerEmail: email,
      ownerPasswordHash: await hashPassword("attacker-chosen-password"),
    });

    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("expected creation to succeed");
    expect(created.reusedExistingUser).toBe(true);

    const { rows } = await adminPool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = $1",
      [email],
    );
    // Their original password still works, and the submitted one does not.
    expect(await verifyPassword("their-real-password", rows[0]!.password_hash))
      .toBe(true);
    expect(
      await verifyPassword("attacker-chosen-password", rows[0]!.password_hash),
    ).toBe(false);
  });

  it("refuses a hostname already taken by another restaurant", async () => {
    const taken = `${PREFIX}-taken.example.test`;
    await createRestaurant(db, {
      slug: `${PREFIX}-host-a`,
      name: "Plat Repo Host A",
      currency: "USD",
      timezone: "Asia/Beirut",
      defaultLocale: "en",
      hostname: taken,
      ownerEmail: `hosta@${PREFIX}.test`,
      ownerPasswordHash: await hashPassword("initial-password-123"),
    });

    const second = await createRestaurant(db, {
      slug: `${PREFIX}-host-b`,
      name: "Plat Repo Host B",
      currency: "USD",
      timezone: "Asia/Beirut",
      defaultLocale: "en",
      hostname: taken,
      ownerEmail: `hostb@${PREFIX}.test`,
      ownerPasswordHash: await hashPassword("initial-password-123"),
    });

    // Two restaurants on one hostname means one of them serves the other's
    // menu, which is the single failure this product cannot have.
    expect(second).toEqual({ ok: false, reason: "hostname-taken" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/platform-repository.test.ts`
Expected: FAIL — `createRestaurant` is not exported.

- [ ] **Step 3: Implement**

Add to `src/core/platform/repository.ts` (extend the imports to
`import { and, asc, eq, sql } from "drizzle-orm";` and add `memberships`,
`users` to the schema import):

```ts
export interface NewRestaurant {
  slug: string;
  name: string;
  currency: string;
  timezone: string;
  defaultLocale: "en" | "ar";
  /** Already normalised by the caller via normalizeHostname(). */
  hostname: string;
  ownerEmail: string;
  /** Already hashed. core/platform must not own the password format. */
  ownerPasswordHash: string;
}

export type CreateRestaurantResult =
  | { ok: true; tenantId: string; reusedExistingUser: boolean }
  | { ok: false; reason: "slug-taken" | "hostname-taken" };

/**
 * Brings a restaurant into existence: tenant, its subdomain, its owner and
 * their membership, in ONE transaction.
 *
 * Atomic on purpose. A tenant with no hostname is invisible to its own owner,
 * and a hostname with no tenant is a dangling record nothing in the console
 * would show -- both are states an operator would have to fix with the psql
 * session this whole phase exists to eliminate.
 *
 * The subdomain is created verified because the platform owns that wildcard.
 * The rule that only verified domains resolve exists to stop a stranger
 * pointing THEIR dns at us and serving a lookalike; a name we issued to
 * ourselves is not that case.
 *
 * Sequential awaits throughout: a transaction is pinned to one connection and
 * PostgreSQL cannot serve concurrent queries on it.
 */
export async function createRestaurant(
  db: Database,
  input: NewRestaurant,
): Promise<CreateRestaurantResult> {
  const email = input.ownerEmail.trim().toLowerCase();

  return db.transaction(async (tx): Promise<CreateRestaurantResult> => {
    const slugTaken = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug))
      .limit(1);
    if (slugTaken.length > 0) return { ok: false, reason: "slug-taken" };

    const hostTaken = await tx
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.hostname, input.hostname))
      .limit(1);
    if (hostTaken.length > 0) return { ok: false, reason: "hostname-taken" };

    const [tenant] = await tx
      .insert(tenants)
      .values({
        slug: input.slug,
        name: input.name,
        status: "trial",
        currency: input.currency,
        timezone: input.timezone,
        defaultLocale: input.defaultLocale,
      })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error("Insert returned no tenant row");

    await tx.insert(domains).values({
      tenantId: tenant.id,
      hostname: input.hostname,
      isPrimary: true,
      verifiedAt: new Date(),
    });

    /*
     * An existing account is REUSED and its password left alone.
     *
     * The schema's own comment says a person may own several restaurants, so
     * finding one here is expected. Overwriting the hash would turn "create a
     * restaurant" into "take over any account", including another operator's.
     */
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId = existing[0]?.id;
    const reusedExistingUser = userId !== undefined;

    if (!userId) {
      const [created] = await tx
        .insert(users)
        .values({
          email,
          name: email.split("@")[0] ?? email,
          passwordHash: input.ownerPasswordHash,
        })
        .returning({ id: users.id });
      if (!created) throw new Error("Insert returned no user row");
      userId = created.id;
    }

    await tx
      .insert(memberships)
      .values({ tenantId: tenant.id, userId, role: "owner" })
      .onConflictDoNothing();

    return { ok: true, tenantId: tenant.id, reusedExistingUser };
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/integration/platform-repository.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/platform/repository.ts tests/integration/platform-repository.test.ts
git commit -m "Create a restaurant, its subdomain and its owner in one transaction"
```

---

## Task 4: Status and domain management

**Files:**
- Modify: `src/core/platform/repository.ts`
- Test: `tests/integration/platform-repository.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3
- Produces:
  - `setRestaurantStatus(db: Database, tenantId: string, status: RestaurantStatus): Promise<boolean>`
  - `attachDomain(db: Database, tenantId: string, hostname: string): Promise<{ ok: true; domainId: string } | { ok: false; reason: "hostname-taken" }>`
  - `setDomainVerified(db: Database, tenantId: string, domainId: string, verified: boolean): Promise<boolean>`
  - `removeDomain(db: Database, tenantId: string, domainId: string): Promise<{ ok: true } | { ok: false; reason: "last-domain" }>`

Every one takes `tenantId` alongside the domain id and filters on both. There is
no RLS beneath this module, so the scoping has to be written out — a domain id
from a form must not be able to reach across restaurants.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/platform-repository.test.ts`:

```ts
import {
  attachDomain,
  removeDomain,
  setDomainVerified,
  setRestaurantStatus,
} from "@/core/platform/repository";

describe("managing a restaurant", () => {
  /** A restaurant with its primary subdomain, for one test to chew on. */
  async function makeRestaurant(key: string) {
    const created = await createRestaurant(db, {
      slug: `${PREFIX}-${key}`,
      name: `Plat Repo ${key}`,
      currency: "USD",
      timezone: "Asia/Beirut",
      defaultLocale: "en",
      hostname: `${PREFIX}-${key}.example.test`,
      ownerEmail: `${key}@${PREFIX}.test`,
      ownerPasswordHash: await hashPassword("initial-password-123"),
    });
    if (!created.ok) throw new Error(`could not create ${key}`);
    return created.tenantId;
  }

  it("suspends and reactivates", async () => {
    const tenantId = await makeRestaurant("status");

    expect(await setRestaurantStatus(db, tenantId, "suspended")).toBe(true);
    expect((await findRestaurant(db, tenantId))?.status).toBe("suspended");

    expect(await setRestaurantStatus(db, tenantId, "active")).toBe(true);
    expect((await findRestaurant(db, tenantId))?.status).toBe("active");
  });

  it("attaches a custom domain UNVERIFIED", async () => {
    const tenantId = await makeRestaurant("attach");

    const attached = await attachDomain(db, tenantId, `custom-attach.${PREFIX}.test`);
    expect(attached.ok).toBe(true);

    const detail = await findRestaurant(db, tenantId);
    const custom = detail?.domains.find((d) => d.hostname.startsWith("custom-attach"));
    // Unverified means it does not resolve. Anyone can point DNS at this
    // platform; without verification they could serve a lookalike site.
    expect(custom?.verifiedAt).toBeNull();
    expect(custom?.isPrimary).toBe(false);
  });

  it("refuses a hostname another restaurant already holds", async () => {
    const first = await makeRestaurant("host-one");
    const second = await makeRestaurant("host-two");
    const shared = `shared.${PREFIX}.test`;

    expect((await attachDomain(db, first, shared)).ok).toBe(true);
    expect(await attachDomain(db, second, shared)).toEqual({
      ok: false,
      reason: "hostname-taken",
    });
  });

  it("marks a domain verified, and back", async () => {
    const tenantId = await makeRestaurant("verify");
    const attached = await attachDomain(db, tenantId, `custom-verify.${PREFIX}.test`);
    if (!attached.ok) throw new Error("attach failed");

    expect(await setDomainVerified(db, tenantId, attached.domainId, true)).toBe(true);
    let detail = await findRestaurant(db, tenantId);
    expect(
      detail?.domains.find((d) => d.id === attached.domainId)?.verifiedAt,
    ).not.toBeNull();

    expect(await setDomainVerified(db, tenantId, attached.domainId, false)).toBe(true);
    detail = await findRestaurant(db, tenantId);
    expect(
      detail?.domains.find((d) => d.id === attached.domainId)?.verifiedAt,
    ).toBeNull();
  });

  it("will not let one restaurant touch another's domain", async () => {
    const mine = await makeRestaurant("scope-mine");
    const theirs = await makeRestaurant("scope-theirs");
    const attached = await attachDomain(db, theirs, `custom-scope.${PREFIX}.test`);
    if (!attached.ok) throw new Error("attach failed");

    // There is no RLS beneath this module, so the tenantId filter in the
    // query is the ONLY thing scoping it. Assert it is really there.
    expect(await setDomainVerified(db, mine, attached.domainId, true)).toBe(false);
    const detail = await findRestaurant(db, theirs);
    expect(
      detail?.domains.find((d) => d.id === attached.domainId)?.verifiedAt,
    ).toBeNull();
  });

  it("refuses to remove the last domain", async () => {
    const tenantId = await makeRestaurant("last");
    const detail = await findRestaurant(db, tenantId);
    const only = detail!.domains[0]!;

    // A restaurant with no hostname cannot be reached by anyone, including
    // its own owner, and nothing in the admin would explain why.
    expect(await removeDomain(db, tenantId, only.id)).toEqual({
      ok: false,
      reason: "last-domain",
    });
    expect((await findRestaurant(db, tenantId))?.domains).toHaveLength(1);
  });

  it("removes an extra domain", async () => {
    const tenantId = await makeRestaurant("remove");
    const attached = await attachDomain(db, tenantId, `custom-remove.${PREFIX}.test`);
    if (!attached.ok) throw new Error("attach failed");

    expect(await removeDomain(db, tenantId, attached.domainId)).toEqual({ ok: true });
    expect((await findRestaurant(db, tenantId))?.domains).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/platform-repository.test.ts`
Expected: FAIL — `setRestaurantStatus` is not exported.

- [ ] **Step 3: Implement**

Add to `src/core/platform/repository.ts`:

```ts
export async function setRestaurantStatus(
  db: Database,
  tenantId: string,
  status: RestaurantStatus,
): Promise<boolean> {
  const rows = await db
    .update(tenants)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning({ id: tenants.id });
  return rows.length > 0;
}

/**
 * Attaches a hostname, deliberately UNVERIFIED.
 *
 * Anyone can point DNS at this platform. Without verification they could serve
 * a lookalike site under a name they do not own, which is why an unverified
 * domain resolves to nothing.
 *
 * Automatic DNS checking is not built -- there is no deployed address to tell
 * anyone to point at yet. THIS IS THE SEAM: when the platform has a host, the
 * check belongs here, and `setDomainVerified` becomes its result rather than
 * an operator's assertion.
 */
export async function attachDomain(
  db: Database,
  tenantId: string,
  hostname: string,
): Promise<{ ok: true; domainId: string } | { ok: false; reason: "hostname-taken" }> {
  const taken = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.hostname, hostname))
    .limit(1);
  if (taken.length > 0) return { ok: false, reason: "hostname-taken" };

  const [row] = await db
    .insert(domains)
    .values({ tenantId, hostname, isPrimary: false, verifiedAt: null })
    .returning({ id: domains.id });
  if (!row) throw new Error("Insert returned no domain row");

  return { ok: true, domainId: row.id };
}

/**
 * Filters on tenantId as well as the domain id, in every statement below.
 *
 * These tables are outside RLS, so there is no policy underneath to catch a
 * missing scope: the WHERE clause IS the isolation. A domain id arriving from
 * a form must not be able to reach into another restaurant.
 */
export async function setDomainVerified(
  db: Database,
  tenantId: string,
  domainId: string,
  verified: boolean,
): Promise<boolean> {
  const rows = await db
    .update(domains)
    .set({ verifiedAt: verified ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(domains.tenantId, tenantId), eq(domains.id, domainId)))
    .returning({ id: domains.id });
  return rows.length > 0;
}

export async function removeDomain(
  db: Database,
  tenantId: string,
  domainId: string,
): Promise<{ ok: true } | { ok: false; reason: "last-domain" }> {
  return db.transaction(async (tx) => {
    // Counted inside the transaction: a concurrent removal would otherwise
    // let two calls each believe another hostname remained.
    const all = await tx
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.tenantId, tenantId));

    if (all.length <= 1) return { ok: false as const, reason: "last-domain" as const };

    await tx
      .delete(domains)
      .where(and(eq(domains.tenantId, tenantId), eq(domains.id, domainId)));

    return { ok: true as const };
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/integration/platform-repository.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Full verify and commit**

Run: `npm run verify`
Expected: PASS.

```bash
git add src/core/platform/repository.ts tests/integration/platform-repository.test.ts
git commit -m "Add status and domain management to the platform repository"
```

---

## Task 5: Server wiring — `requirePlatformAdmin` and impersonation-aware access

This changes the product's central authorization function. Take it slowly and
run the isolation suite at the end.

**Files:**
- Modify: `src/server/auth.ts`
- Create: `src/server/platform.ts`

**Interfaces:**
- Consumes: `mayAdminister`, `IMPERSONATION_COOKIE` (Task 1); `findRestaurant` (Task 2)
- Produces:
  - `requirePlatformAdmin(): Promise<CurrentSession>` — redirects to `/` for anyone else
  - `getImpersonatedTenantId(): Promise<string | null>`
  - `requireMembership(tenantId)` — unchanged signature, now honours impersonation
  - `src/server/platform.ts` exporting `platformSubdomain(slug: string): string`

- [ ] **Step 1: Add the impersonation helpers and the platform composition root**

Create `src/server/platform.ts`:

```ts
import { normalizeHostname } from "@/core/tenant/hostname";
import { env } from "@/env";

/**
 * The hostname a new restaurant gets for free.
 *
 * PLATFORM_DOMAIN carries a port in development ("localhost:3000"), and the
 * `domains` table stores hostnames WITHOUT one -- normalizeHostname is what
 * the request path uses to strip it, so building the stored value through the
 * same function is what keeps the two spellings from drifting apart.
 *
 * Reading env here rather than in core/ is the composition-root rule: core
 * receives its configuration, it never goes looking for it.
 */
export function platformSubdomain(slug: string): string {
  return `${slug}.${normalizeHostname(env.PLATFORM_DOMAIN)}`;
}
```

Then in `src/server/auth.ts`, add the import:

```ts
import {
  IMPERSONATION_COOKIE,
  mayAdminister,
} from "@/core/auth/impersonation";
```

and add these functions after `requireSession`:

```ts
/**
 * The tenant this session is currently acting as, or null.
 *
 * The cookie is client-controlled and carries no authority of its own -- it
 * only names WHICH restaurant. Whether the holder may enter one at all is
 * decided by `users.is_platform_admin`, read from the session on the server.
 * See core/auth/impersonation.ts.
 */
export async function getImpersonatedTenantId(): Promise<string | null> {
  return (await cookies()).get(IMPERSONATION_COOKIE)?.value ?? null;
}

/**
 * The operator console guard.
 *
 * Redirects rather than 403s, for the same reason requireMembership does:
 * telling a stranger that an operator console exists here is itself a small
 * leak.
 */
export async function requirePlatformAdmin(): Promise<CurrentSession> {
  const session = await requireSession();
  if (!session.user.isPlatformAdmin) redirect("/");
  return session;
}
```

- [ ] **Step 2: Make `requireMembership` honour impersonation**

Replace the body of `requireMembership` in `src/server/auth.ts`:

```ts
/**
 * Authorization for one restaurant.
 *
 * Being signed in is NOT the same as being entitled to this tenant, and
 * conflating the two is exactly how multi-tenant products leak. Every admin
 * action that touches tenant data goes through here first.
 *
 * A platform operator may also be here, having deliberately chosen to act as
 * this restaurant. Being a platform admin is NOT by itself access: without
 * that choice they get exactly what any other signed-in stranger gets. The
 * rule itself lives in core/auth/impersonation.ts, where it is enumerated as a
 * truth table.
 */
export async function requireMembership(tenantId: string): Promise<{
  user: User;
  membership: TenantMembership;
  /** True when the caller is an operator acting as this restaurant. */
  impersonating: boolean;
}> {
  const session = await requireSession();

  // Sequential, not Promise.all: both are cheap, and the cookie read is
  // synchronous work behind an async API.
  const membership = await findMembership(db, session.user.id, tenantId);
  const impersonatingTenantId = await getImpersonatedTenantId();

  const allowed = mayAdminister({
    hasMembership: membership !== null,
    isPlatformAdmin: session.user.isPlatformAdmin,
    impersonatingTenantId,
    tenantId,
  });

  // 404-ish rather than 403: telling an outsider that a tenant id exists is
  // itself a small leak.
  if (!allowed) redirect("/");

  if (membership) {
    return { user: session.user, membership, impersonating: false };
  }

  /*
   * An impersonating operator has no membership row, so one is synthesised
   * from the tenant itself. It must carry the REAL name and currency: a
   * placeholder currency would render a client's prices wrong by orders of
   * magnitude, which is exactly the bug the money rules exist to prevent.
   */
  const restaurant = await findRestaurant(db, tenantId);
  if (!restaurant) redirect("/");

  return {
    user: session.user,
    membership: {
      tenantId: restaurant.id,
      tenantName: restaurant.name,
      tenantSlug: restaurant.slug,
      currency: restaurant.currency,
      role: "owner",
    },
    impersonating: true,
  };
}
```

Add the import for `findRestaurant`:

```ts
import { findRestaurant } from "@/core/platform/repository";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. `requireMembership` gained a field rather than changing an
existing one, so every current caller still compiles.

- [ ] **Step 4: Run the whole suite, especially isolation**

Run: `npm run verify`
Expected: PASS, 215 tests.

If anything in `tests/integration/tenant-isolation.test.ts` fails, stop — that
is a real authorization regression, not a test to adjust.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth.ts src/server/platform.ts
git commit -m "Teach requireMembership about operator impersonation"
```

---

## Task 6: Operator Server Actions

**Files:**
- Create: `src/app/admin/operator/actions.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5
- Produces:
  - `interface OperatorActionState { error: string | null; saved?: boolean; target?: string }`
  - `createRestaurant(_previous: OperatorActionState, formData: FormData): Promise<OperatorActionState>`
  - `setRestaurantStatus(tenantId: string, status: "trial" | "active" | "suspended"): Promise<OperatorActionState>`
  - `attachDomain(tenantId: string, _previous: OperatorActionState, formData: FormData): Promise<OperatorActionState>`
  - `setDomainVerified(tenantId: string, domainId: string, verified: boolean): Promise<OperatorActionState>`
  - `removeDomain(tenantId: string, domainId: string): Promise<OperatorActionState>`
  - `startImpersonating(tenantId: string): Promise<OperatorActionState>`
  - `stopImpersonating(): Promise<OperatorActionState>`

- [ ] **Step 1: Write the actions**

Create `src/app/admin/operator/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword } from "@/core/auth/password";
import { IMPERSONATION_COOKIE } from "@/core/auth/impersonation";
import { withTenant } from "@/core/db/tenant";
import { createMenuRepository } from "@/core/menu/repository";
import * as platform from "@/core/platform/repository";
import { isValidSlug, normalizeHostname } from "@/core/tenant/hostname";
import { requirePlatformAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { platformSubdomain } from "@/server/platform";

/*
 * Operator actions.
 *
 * Every one begins with requirePlatformAdmin. A layout guard does not run for
 * a Server Action invoked directly, and these actions create restaurants and
 * grant logins -- the most privileged operations in the product.
 */

const uuid = z.string().uuid();

export interface OperatorActionState {
  error: string | null;
  saved?: boolean;
  /**
   * Where the client should navigate next. Never redirect() from here: the
   * admin is reached by rewriting app.<platform> onto /admin, and redirect()
   * resolves the path against the app's own route tree, landing on the
   * platform home page. The client calls window.location.assign().
   */
  target?: string;
}

const restaurantInput = z.object({
  name: z.string().trim().min(1, "The restaurant needs a name."),
  slug: z.string().trim().toLowerCase(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, "Currency must be a 3-letter code like USD or LBP."),
  timezone: z.string().trim().min(1, "Pick a timezone."),
  defaultLocale: z.enum(["en", "ar"]),
  ownerEmail: z.string().trim().toLowerCase().email("That is not an email address."),
  ownerPassword: z
    .string()
    .min(12, "Give the owner a password of at least 12 characters."),
  exampleMenu: z.boolean(),
});

/** A few dishes, so an owner can be shown something before they supply anything. */
const EXAMPLE_MENU = [
  {
    nameEn: "Starters",
    nameAr: "المقبلات",
    items: [
      { nameEn: "Hummus", nameAr: "حمص", price: 650 },
      { nameEn: "Fattoush", nameAr: "فتوش", price: 800 },
    ],
  },
  {
    nameEn: "Grills",
    nameAr: "المشاوي",
    items: [
      { nameEn: "Chicken Taouk", nameAr: "شيش طاووق", price: 1450 },
      { nameEn: "Lamb Kafta", nameAr: "كفتة", price: 1650 },
    ],
  },
];

export async function createRestaurant(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();

  const parsed = restaurantInput.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    defaultLocale: formData.get("defaultLocale"),
    ownerEmail: formData.get("ownerEmail"),
    ownerPassword: formData.get("ownerPassword"),
    exampleMenu: formData.get("exampleMenu") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { slug } = parsed.data;

  /*
   * RESERVED_SLUGS is enforced inside isValidSlug. Handing "app" to a
   * restaurant would put their public site on the admin origin, which is
   * where session cookies live -- their page could then read them.
   */
  if (!isValidSlug(slug)) {
    return {
      error:
        "That web address is not usable. Use lowercase letters, numbers and " +
        "hyphens, and avoid reserved names like app or www.",
    };
  }

  const created = await platform.createRestaurant(db, {
    slug,
    name: parsed.data.name,
    currency: parsed.data.currency,
    timezone: parsed.data.timezone,
    defaultLocale: parsed.data.defaultLocale,
    hostname: platformSubdomain(slug),
    ownerEmail: parsed.data.ownerEmail,
    ownerPasswordHash: await hashPassword(parsed.data.ownerPassword),
  });

  if (!created.ok) {
    return {
      error:
        created.reason === "slug-taken"
          ? "Another restaurant already uses that web address."
          : "That hostname is already taken.",
    };
  }

  /*
   * The example menu is written AFTER the restaurant, in its own transaction.
   * Menu tables are under RLS and need a tenant context, which cannot exist
   * until the tenant does. If this fails the operator has a real restaurant
   * with an empty menu -- visible in the console, and fixable with the
   * quick-add row in seconds.
   */
  if (parsed.data.exampleMenu) {
    await withTenant(db, created.tenantId, async (session) => {
      const repo = createMenuRepository(session);
      // Sequential: these share one transaction, and therefore one connection.
      for (const [index, category] of EXAMPLE_MENU.entries()) {
        const saved = await repo.createCategory({
          nameEn: category.nameEn,
          nameAr: category.nameAr,
          sortOrder: index,
        });
        for (const [position, item] of category.items.entries()) {
          await repo.createItem({
            categoryId: saved.id,
            nameEn: item.nameEn,
            nameAr: item.nameAr,
            basePriceMinor: item.price,
            sortOrder: position,
          });
        }
      }
    });
  }

  revalidatePath("/operator");
  return {
    error: null,
    saved: true,
    target: `/operator/${created.tenantId}`,
  };
}

export async function setRestaurantStatus(
  tenantId: string,
  status: "trial" | "active" | "suspended",
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  const changed = await platform.setRestaurantStatus(db, id, status);
  if (!changed) return { error: "That restaurant no longer exists." };

  revalidatePath(`/operator/${id}`);
  revalidatePath("/operator");
  return { error: null, saved: true };
}

export async function attachDomain(
  tenantId: string,
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  const raw = String(formData.get("hostname") ?? "").trim();
  if (!raw) return { error: "Enter a domain name." };

  // Normalised before storage: the Host header arrives with arbitrary casing
  // and possibly a port, and a hostname stored in a second spelling is a
  // restaurant that silently cannot be reached.
  const hostname = normalizeHostname(raw);
  if (!hostname.includes(".")) {
    return { error: "That does not look like a domain name." };
  }

  const attached = await platform.attachDomain(db, id, hostname);
  if (!attached.ok) {
    return { error: "Another restaurant already uses that domain." };
  }

  revalidatePath(`/operator/${id}`);
  return { error: null, saved: true };
}

export async function setDomainVerified(
  tenantId: string,
  domainId: string,
  verified: boolean,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  const changed = await platform.setDomainVerified(
    db,
    id,
    uuid.parse(domainId),
    verified,
  );
  if (!changed) return { error: "That domain no longer exists." };

  revalidatePath(`/operator/${id}`);
  return { error: null, saved: true };
}

export async function removeDomain(
  tenantId: string,
  domainId: string,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  const removed = await platform.removeDomain(db, id, uuid.parse(domainId));
  if (!removed.ok) {
    return {
      error:
        "This is the restaurant's only domain. Removing it would leave the " +
        "site unreachable, including for its owner.",
    };
  }

  revalidatePath(`/operator/${id}`);
  return { error: null, saved: true };
}

/**
 * Enter a restaurant's admin as its owner sees it.
 *
 * The cookie only names the restaurant. Whether the holder may act as anyone
 * at all is re-decided from `users.is_platform_admin` on every request, so
 * this grants nothing a forged cookie could not already claim and fail with.
 */
export async function startImpersonating(
  tenantId: string,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  (await cookies()).set(IMPERSONATION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return { error: null, saved: true, target: `/${id}` };
}

export async function stopImpersonating(): Promise<OperatorActionState> {
  // Deliberately NOT behind requirePlatformAdmin: stopping is always safe, and
  // gating it would strand anyone whose admin flag was removed mid-session.
  (await cookies()).delete(IMPERSONATION_COOKIE);
  return { error: null, saved: true, target: "/operator" };
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/operator/actions.ts
git commit -m "Add the operator Server Actions"
```

---

## Task 7: The console screens

**Files:**
- Create: `src/app/admin/operator/layout.tsx`
- Create: `src/app/admin/operator/page.tsx`
- Create: `src/app/admin/operator/new/page.tsx`
- Create: `src/app/admin/operator/new/create-form.tsx`

**Interfaces:**
- Consumes: `requirePlatformAdmin`, `listRestaurants`, `createRestaurant` action
- Produces: the console's list and create screens

- [ ] **Step 1: Layout and list**

Create `src/app/admin/operator/layout.tsx`:

```tsx
import Link from "next/link";
import { requirePlatformAdmin } from "@/server/auth";
import { SignOutButton } from "../sign-out-button";

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guards every page beneath. Each action repeats the check, because an
  // action can be invoked without this layout ever running.
  await requirePlatformAdmin();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-16">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-rule)] py-4">
        <div className="min-w-0">
          <p className="truncate font-display text-lg">Platform</p>
          <nav className="mt-1 flex gap-3 text-[0.8rem]">
            <Link
              href="/operator"
              className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              Restaurants
            </Link>
            <Link
              href="/operator/new"
              className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              New restaurant
            </Link>
          </nav>
        </div>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
```

Create `src/app/admin/operator/page.tsx`:

```tsx
import Link from "next/link";
import { listRestaurants } from "@/core/platform/repository";
import { requirePlatformAdmin } from "@/server/auth";
import { db } from "@/server/db";

export default async function OperatorHome() {
  await requirePlatformAdmin();
  const restaurants = await listRestaurants(db);

  if (restaurants.length === 0) {
    return (
      <main className="py-10">
        <h1 className="font-display text-lg">No restaurants yet</h1>
        <p className="mt-2 text-[0.85rem] text-[var(--color-muted)]">
          Create the first one and it will be live on its own address
          immediately.
        </p>
        <Link
          href="/operator/new"
          className="mt-4 inline-block rounded-md bg-[var(--color-accent)] px-4 py-2 text-[0.9rem] font-medium text-[var(--color-on-accent)]"
        >
          New restaurant
        </Link>
      </main>
    );
  }

  return (
    <main className="py-6">
      <h1 className="font-display text-lg">Restaurants</h1>

      <ul className="mt-4 divide-y divide-[var(--color-rule)]">
        {restaurants.map((restaurant) => (
          <li key={restaurant.id}>
            <Link
              href={`/operator/${restaurant.id}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
            >
              <span className="min-w-0 flex-1 truncate text-[0.95rem]">
                {restaurant.name}
              </span>
              <span className="truncate text-[0.8rem] text-[var(--color-muted)]">
                {restaurant.primaryDomain ?? "no address"}
              </span>
              <span className="shrink-0 rounded-sm border border-[var(--color-rule)] px-1.5 py-0.5 text-[0.65rem] tracking-wide text-[var(--color-muted)] uppercase">
                {restaurant.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: The create form**

Create `src/app/admin/operator/new/create-form.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { createRestaurant, type OperatorActionState } from "../actions";

const initialState: OperatorActionState = { error: null };

const field =
  "rounded-md border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[0.95rem]";
const label = "text-[0.8rem] text-[var(--color-muted)]";

/** Name -> slug, matching isValidSlug: lowercase, digits and hyphens only. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function CreateRestaurantForm({ platformDomain }: { platformDomain: string }) {
  const [state, formAction, pending] = useActionState(
    createRestaurant,
    initialState,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    // Never redirect() from a Server Action here: the admin is reached by a
    // host rewrite, and redirect() would resolve against the wrong route tree
    // and land on the platform home page.
    if (state.target) window.location.assign(state.target);
  }, [state]);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Restaurant name</span>
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label}>Web address</span>
          <input
            name="slug"
            value={effectiveSlug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
            required
            className={field}
          />
          <span className="text-[0.75rem] text-[var(--color-muted)]">
            {effectiveSlug || "your-restaurant"}.{platformDomain}
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Currency</span>
          <input
            name="currency"
            defaultValue="USD"
            required
            maxLength={3}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label}>Timezone</span>
          <input
            name="timezone"
            defaultValue="Asia/Beirut"
            required
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label}>Menu language</span>
          <select name="defaultLocale" defaultValue="en" className={field}>
            <option value="en">English</option>
            <option value="ar">Arabic</option>
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-4 rounded-md border border-[var(--color-rule)] p-4">
        <legend className={label}>Owner&rsquo;s login</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Email</span>
            <input name="ownerEmail" type="email" required className={field} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={label}>Initial password</span>
            <input
              name="ownerPassword"
              type="text"
              required
              minLength={12}
              className={field}
            />
          </label>
        </div>

        {/*
          Deliberately type="text": the operator reads this password out to the
          owner in the room. A masked field they cannot see helps nobody here,
          and there is no email adapter to send an invitation instead.
        */}
        <p className="text-[0.75rem] text-[var(--color-muted)]">
          If this email already has an account, it keeps its current password
          and simply gains this restaurant.
        </p>
      </fieldset>

      <label className="flex items-center gap-2 text-[0.85rem]">
        <input type="checkbox" name="exampleMenu" />
        Start with an example menu, for demoing
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-rule)] px-3 py-2 text-[0.85rem]"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-[var(--color-accent)] px-4 py-2 text-[0.9rem] font-medium text-[var(--color-on-accent)] disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create restaurant"}
      </button>
    </form>
  );
}
```

Create `src/app/admin/operator/new/page.tsx`:

```tsx
import { normalizeHostname } from "@/core/tenant/hostname";
import { env } from "@/env";
import { requirePlatformAdmin } from "@/server/auth";
import { CreateRestaurantForm } from "./create-form";

export default async function NewRestaurantPage() {
  await requirePlatformAdmin();

  return (
    <main className="py-6">
      <h1 className="font-display text-lg">New restaurant</h1>
      <p className="mt-2 max-w-prose text-[0.85rem] text-[var(--color-muted)]">
        This creates the restaurant, its web address and the owner&rsquo;s
        login in one step. They can sign in and start adding dishes
        immediately.
      </p>

      <CreateRestaurantForm platformDomain={normalizeHostname(env.PLATFORM_DOMAIN)} />
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/operator
git commit -m "Add the operator console list and create screens"
```

---

## Task 8: The restaurant detail screen

**Files:**
- Create: `src/app/admin/operator/[tenantId]/page.tsx`
- Create: `src/app/admin/operator/[tenantId]/status-control.tsx`
- Create: `src/app/admin/operator/[tenantId]/domain-list.tsx`
- Create: `src/app/admin/operator/[tenantId]/impersonate-button.tsx`

**Interfaces:**
- Consumes: `findRestaurant`; the actions from Task 6
- Produces: the per-restaurant screen

- [ ] **Step 1: Status control**

Create `src/app/admin/operator/[tenantId]/status-control.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setRestaurantStatus } from "../actions";

const STATUSES = ["trial", "active", "suspended"] as const;

/**
 * Suspending is how a non-paying client is switched off. It is deliberately
 * reversible and deliberately not deletion: ON DELETE CASCADE reaches every
 * table a client owns, and nobody needs that yet.
 */
export function StatusControl({
  tenantId,
  status,
}: {
  tenantId: string;
  status: (typeof STATUSES)[number];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STATUSES.map((option) => (
        <button
          key={option}
          type="button"
          disabled={pending || option === status}
          aria-label={`Set status to ${option}`}
          onClick={() =>
            startTransition(async () => {
              const result = await setRestaurantStatus(tenantId, option);
              if (result.error) setError(result.error);
              router.refresh();
            })
          }
          className={`rounded-md border px-3 py-1.5 text-[0.8rem] capitalize disabled:opacity-100 ${
            option === status
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
              : "border-[var(--color-rule)] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          {option}
        </button>
      ))}
      {error ? (
        <p role="alert" className="basis-full text-[0.8rem]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Domain list**

Create `src/app/admin/operator/[tenantId]/domain-list.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  attachDomain,
  removeDomain,
  setDomainVerified,
  type OperatorActionState,
} from "../actions";

const initialState: OperatorActionState = { error: null };

const ghost =
  "rounded-md border border-[var(--color-rule)] px-2 py-1 text-[0.75rem] text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-60";

export interface DomainRow {
  id: string;
  hostname: string;
  isPrimary: boolean;
  verified: boolean;
}

export function DomainList({
  tenantId,
  domains,
}: {
  tenantId: string;
  domains: DomainRow[];
}) {
  const action = attachDomain.bind(null, tenantId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const hostRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!state.saved) return;
    hostRef.current?.focus();
    router.refresh();
  }, [state, router]);

  return (
    <section className="mt-8">
      <h2 className="font-display text-base">Addresses</h2>

      {/*
        Says what is not built, rather than showing a status that implies a
        check is happening. A verification UI that is trusted and wrong is
        worse than none: it would tell the operator a client's domain is live
        when nothing has looked.
      */}
      <p className="mt-1 max-w-prose text-[0.8rem] text-[var(--color-muted)]">
        Automatic DNS checking is not built yet — there is no deployed address
        to point a domain at. Until then, confirm the domain resolves yourself,
        then mark it verified here. Unverified addresses do not serve the site.
      </p>

      <ul className="mt-3 divide-y divide-[var(--color-rule)]">
        {domains.map((domain) => (
          <li
            key={domain.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-[0.9rem]">
              {domain.hostname}
            </span>

            {domain.isPrimary ? (
              <span className="shrink-0 rounded-sm border border-[var(--color-rule)] px-1.5 py-0.5 text-[0.65rem] tracking-wide text-[var(--color-muted)] uppercase">
                Primary
              </span>
            ) : null}

            <span
              className={`shrink-0 text-[0.75rem] ${
                domain.verified ? "" : "text-[var(--color-muted)]"
              }`}
            >
              {domain.verified ? "Verified" : "Not verified"}
            </span>

            <button
              type="button"
              disabled={busy}
              aria-label={
                domain.verified
                  ? `Mark ${domain.hostname} unverified`
                  : `Mark ${domain.hostname} verified`
              }
              onClick={() =>
                startBusy(async () => {
                  const result = await setDomainVerified(
                    tenantId,
                    domain.id,
                    !domain.verified,
                  );
                  if (result.error) setError(result.error);
                  router.refresh();
                })
              }
              className={ghost}
            >
              {domain.verified ? "Unverify" : "Mark verified"}
            </button>

            <button
              type="button"
              disabled={busy}
              aria-label={`Remove ${domain.hostname}`}
              onClick={() =>
                startBusy(async () => {
                  const result = await removeDomain(tenantId, domain.id);
                  if (result.error) setError(result.error);
                  router.refresh();
                })
              }
              className={ghost}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-2 text-[0.8rem]">
          {error}
        </p>
      ) : null}

      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={hostRef}
          name="hostname"
          aria-label="New domain"
          placeholder="theirrestaurant.com"
          required
          className="min-w-48 flex-1 rounded-md border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[0.9rem]"
        />
        <button type="submit" disabled={pending} className={ghost}>
          {pending ? "Adding…" : "Add domain"}
        </button>
        {state.error ? (
          <p role="alert" className="basis-full text-[0.8rem]">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
```

- [ ] **Step 3: Impersonate button and the page**

Create `src/app/admin/operator/[tenantId]/impersonate-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { startImpersonating } from "../actions";

export function ImpersonateButton({
  tenantId,
  restaurantName,
}: {
  tenantId: string;
  restaurantName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-8 border-t border-[var(--color-rule)] pt-5">
      <h2 className="font-display text-base">Support</h2>
      <p className="mt-1 max-w-prose text-[0.8rem] text-[var(--color-muted)]">
        Open this restaurant&rsquo;s admin exactly as its owner sees it. Any
        change you make there is a change they will see.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startImpersonating(tenantId);
            if (result.error) {
              setError(result.error);
              return;
            }
            // window.location.assign, never redirect(): the admin is reached
            // by a host rewrite, and redirect() resolves against the app's own
            // route tree and lands on the platform home page.
            if (result.target) window.location.assign(result.target);
          })
        }
        className="mt-3 rounded-md border border-[var(--color-rule)] px-3 py-2 text-[0.85rem] disabled:opacity-60"
      >
        {pending ? "Opening…" : `Sign in as ${restaurantName}`}
      </button>

      {error ? (
        <p role="alert" className="mt-2 text-[0.8rem]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

Create `src/app/admin/operator/[tenantId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { findRestaurant } from "@/core/platform/repository";
import { requirePlatformAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { DomainList } from "./domain-list";
import { ImpersonateButton } from "./impersonate-button";
import { StatusControl } from "./status-control";

export default async function OperatorRestaurantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requirePlatformAdmin();
  const { tenantId } = await params;

  const restaurant = await findRestaurant(db, tenantId);
  if (!restaurant) notFound();

  return (
    <main className="py-6">
      <Link
        href="/operator"
        className="text-[0.8rem] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        ← All restaurants
      </Link>

      <h1 className="mt-2 font-display text-lg">{restaurant.name}</h1>
      <p className="mt-1 text-[0.8rem] text-[var(--color-muted)]">
        {restaurant.slug} · {restaurant.currency} · {restaurant.timezone} ·{" "}
        {restaurant.defaultLocale === "ar" ? "Arabic" : "English"}
      </p>

      <section className="mt-6">
        <h2 className="font-display text-base">Status</h2>
        <p className="mt-1 max-w-prose text-[0.8rem] text-[var(--color-muted)]">
          A suspended restaurant explains itself to visitors rather than
          disappearing. Nothing is deleted.
        </p>
        <div className="mt-3">
          <StatusControl tenantId={restaurant.id} status={restaurant.status} />
        </div>
      </section>

      <DomainList
        tenantId={restaurant.id}
        domains={restaurant.domains.map((domain) => ({
          id: domain.id,
          hostname: domain.hostname,
          isPrimary: domain.isPrimary,
          verified: domain.verifiedAt !== null,
        }))}
      />

      <ImpersonateButton
        tenantId={restaurant.id}
        restaurantName={restaurant.name}
      />
    </main>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/operator/[tenantId]"
git commit -m "Add the per-restaurant operator screen"
```

---

## Task 9: The impersonation banner, and no dead end for operators

**Files:**
- Create: `src/app/admin/[tenantId]/impersonation-banner.tsx`
- Modify: `src/app/admin/[tenantId]/layout.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `requireMembership().impersonating`; `stopImpersonating`
- Produces: `<ImpersonationBanner restaurantName={string} />`

- [ ] **Step 1: The banner**

Create `src/app/admin/[tenantId]/impersonation-banner.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { stopImpersonating } from "../operator/actions";

/**
 * Unmissable on purpose.
 *
 * The whole hazard of impersonation is forgetting you are doing it and
 * editing a client's live menu believing it is the demo. A subtle indicator
 * would defeat the point.
 */
export function ImpersonationBanner({
  restaurantName,
}: {
  restaurantName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-[var(--color-on-accent)]"
    >
      <span className="text-[0.8rem]">
        You are working inside <strong>{restaurantName}</strong>. Changes are
        theirs.
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await stopImpersonating();
            if (result.target) window.location.assign(result.target);
          })
        }
        className="rounded-md border border-[var(--color-on-accent)] px-2.5 py-1 text-[0.75rem] disabled:opacity-60"
      >
        {pending ? "Leaving…" : "Leave"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Render it in the tenant admin layout**

In `src/app/admin/[tenantId]/layout.tsx`, change the destructuring and add the
banner. Replace:

```tsx
  const { membership } = await requireMembership(tenantId);
```

with:

```tsx
  const { membership, impersonating } = await requireMembership(tenantId);
```

and add the import:

```tsx
import { ImpersonationBanner } from "./impersonation-banner";
```

Then render the banner as the first child of the returned `<div>`, before the
`<header>`:

```tsx
      {impersonating ? (
        <ImpersonationBanner restaurantName={membership.tenantName} />
      ) : null}
```

- [ ] **Step 3: Stop the admin home dead-ending an operator**

In `src/app/admin/page.tsx`, replace the no-memberships block. The operator has
no memberships, and currently gets told their account is not linked to a
restaurant — which is true and useless.

Change the import line to:

```tsx
import { requireSession } from "@/server/auth";
```

(unchanged) and replace the zero-membership branch with:

```tsx
  if (memberships.length === 0) {
    // A platform operator legitimately has no memberships. Sending them to a
    // dead end that says "ask whoever set this up" -- when that is them -- is
    // the kind of small wrongness that makes a product feel unfinished.
    if (user.isPlatformAdmin) redirect("/operator");

    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3 px-6 py-16 text-center">
        <h1 className="font-display text-xl">No restaurant yet</h1>
        <p className="text-[0.85rem] text-[var(--color-muted)]">
          Your account is not linked to a restaurant. Ask whoever set this up to
          add you.
        </p>
      </main>
    );
  }
```

and change the first line of the component to destructure `user` as well:

```tsx
  const { user, memberships } = await requireSession();
```

Also add a console link for an operator who *does* have memberships, after the
`<h1>` in the picker:

```tsx
      {user.isPlatformAdmin ? (
        <Link
          href="/operator"
          className="text-[0.8rem] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          Platform console →
        </Link>
      ) : null}
```

- [ ] **Step 4: Verify**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/[tenantId]/impersonation-banner.tsx" "src/app/admin/[tenantId]/layout.tsx" src/app/admin/page.tsx
git commit -m "Show an impersonation banner, and give operators somewhere to land"
```

---

## Task 10: Run it — the manual pass that finds the real bugs

Static checks have never caught a bug in this project. This task is not
optional.

- [ ] **Step 1: Start the preview and make yourself an operator**

Stop any running dev server first — Next refuses a second instance per
directory. Then start the preview through the tooling (never `npm run dev` in a
shell) and run:

```bash
node scripts/create-admin.ts operator@platform.test demo-password-123 alpha-grill owner --platform-admin
```

- [ ] **Step 2: Walk the whole onboarding path by hand**

At `app.localhost:3000`, signed in as the operator:

1. `/operator` lists the seeded restaurants with their addresses and statuses.
2. Create a restaurant: name "Test Bistro", check the slug auto-fills to
   `test-bistro`, currency USD, owner `owner@test-bistro.test`, a 12+ character
   password, **tick the example menu**. Submit.
3. It lands on the detail page. The primary address is
   `test-bistro.localhost` and reads **Verified**.
4. Visit `test-bistro.localhost:3000` — the example menu is live.
5. Try to create a second restaurant with slug `app`. It must be refused with
   the reserved-name message, **not** created.
6. Try slug `test-bistro` again. Refused as taken.
7. Add domain `custom.example.com`. It appears **Not verified**. Mark it
   verified, then unverify it.
8. Try to remove the primary — with only two domains that will succeed, so
   first remove `custom.example.com`, then try to remove the last one. It must
   refuse and say why.
9. Suspend the restaurant, reload `test-bistro.localhost:3000` — it must
   explain itself rather than 404. Reactivate.
10. Click "Sign in as Test Bistro". The banner appears; the menu is theirs; add
    a dish to prove writes work. Click **Leave** — you land back in the console
    and the banner is gone.
11. While NOT impersonating, put a different tenant's id in the URL
    (`app.localhost:3000/<alpha-grill-id>`)... note the operator has a
    membership in alpha-grill from step 1, so instead use `beta-bistro`'s id,
    where they have none. **You must be redirected away.** This is the security
    property; if it fails, stop everything.
12. Sign out, sign in as `owner@test-bistro.test` with the password you set.
    You land on their menu. `/operator` must redirect you away.

Check `read_console_messages` and `preview_logs` after each step.

- [ ] **Step 3: Clean up the test restaurant**

```bash
psql -U postgres -h localhost -d restaurant_platform_dev -c "DELETE FROM tenants WHERE slug = 'test-bistro'; DELETE FROM users WHERE email = 'owner@test-bistro.test';"
```

`psql` lives in `C:\Program Files\PostgreSQL\17\bin`.

- [ ] **Step 4: Fix anything found, then commit**

```bash
git add -A
git commit -m "Fix what running the operator console by hand turned up"
```

If nothing needed fixing, skip the commit and say so.

---

## Task 11: The authorization matrix, tested

**Files:**
- Modify: `tests/integration/tenant-isolation.test.ts`

**Interfaces:**
- Consumes: `mayAdminister` (Task 1)
- Produces: nothing

Task 1 tests the rule in isolation. This proves the rule is the one actually
guarding the door, against the real database.

- [ ] **Step 1: Write the test**

Append to `tests/integration/tenant-isolation.test.ts`:

```ts
describe("operator impersonation (isolation)", () => {
  /*
   * requireMembership cannot be called here -- it reads cookies through
   * next/headers. What CAN be checked against the real database is the pair
   * of facts it combines: the membership lookup, and the rule applied to it.
   * The end-to-end path is covered in tests/e2e/operator.spec.ts.
   */
  it("gives a platform admin no membership they were not granted", async () => {
    const { rows } = await adminPool.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, is_platform_admin)
       VALUES ('operator-isolation@platform.test', 'op', 'x', true)
       ON CONFLICT (email) DO UPDATE SET is_platform_admin = true
       RETURNING id`,
    );
    const operatorId = rows[0]!.id;

    const membership = await findMembership(db, operatorId, tenantA);
    expect(membership).toBeNull();

    // Platform admin, no membership, not impersonating: still out.
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: true,
        impersonatingTenantId: null,
        tenantId: tenantA,
      }),
    ).toBe(false);

    // Impersonating B does not open A.
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: true,
        impersonatingTenantId: tenantB,
        tenantId: tenantA,
      }),
    ).toBe(false);

    // Impersonating A opens A, and only A.
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: true,
        impersonatingTenantId: tenantA,
        tenantId: tenantA,
      }),
    ).toBe(true);

    await adminPool.query("DELETE FROM users WHERE id = $1", [operatorId]);
  });
});
```

Add the imports at the top of the file:

```ts
import { mayAdminister } from "@/core/auth/impersonation";
import { findMembership } from "@/core/auth/repository";
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/integration/tenant-isolation.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tenant-isolation.test.ts
git commit -m "Prove a platform admin gets no ambient access to a restaurant"
```

---

## Task 12: E2E — onboard a restaurant from nothing

**Files:**
- Create: `tests/e2e/operator.spec.ts`
- Modify: `tests/e2e/support/sandbox.ts`

**Interfaces:**
- Consumes: `OPERATOR_EMAIL`, `SANDBOX_PASSWORD`, `sandbox` from the fixture
- Produces: nothing

The sandbox already provisions `operator@platform.test` with
`is_platform_admin = true` and a membership in the project's tenant. That is
exactly the account this spec needs.

- [ ] **Step 1: Give the spec a cleanup helper in the sandbox**

Add to `tests/e2e/support/sandbox.ts`, exported:

```ts
/**
 * Removes a restaurant this suite created through the console, so a second run
 * does not collide on the unique slug.
 *
 * Provisioning runs as the migration role for the same reason the rest of this
 * file does: creating and destroying a restaurant is an operator action, and
 * the app role deliberately cannot write outside a tenant context.
 */
export async function dropRestaurant(
  slug: string,
  ownerEmail: string,
): Promise<void> {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL must be set");

  const pool = new Pool({ connectionString, max: 1 });
  try {
    // Sequential: one connection.
    await pool.query("DELETE FROM tenants WHERE slug = $1", [slug]);
    await pool.query("DELETE FROM users WHERE email = $1", [ownerEmail]);
    await pool.query("DELETE FROM login_attempts WHERE identifier = $1", [
      ownerEmail,
    ]);
  } finally {
    await pool.end();
  }
}
```

- [ ] **Step 2: Write the spec**

Create `tests/e2e/operator.spec.ts`:

```ts
import { type Page } from "@playwright/test";
import {
  dropRestaurant,
  expect,
  OPERATOR_EMAIL,
  SANDBOX_PASSWORD,
  test,
  type Sandbox,
} from "./support/sandbox";
import { ADMIN, PORT } from "./support/urls";

/**
 * The sale, start to finish.
 *
 * The operator creates a restaurant in a browser, the owner signs in with the
 * password just set, and a customer sees the menu on its own address. That is
 * the onboarding claim this whole phase exists to make true, so it exists as a
 * test rather than as a hope.
 *
 * Isolation is by data: the slug carries the Playwright project and parallel
 * slot, and the spec drops what it created so a second run does not collide on
 * the unique slug.
 */
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, email: string, password: string) {
  // Drop any existing session: the login page redirects an already-signed-in
  // visitor away, so its fields would never appear.
  await page.context().clearCookies();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait to actually leave /login before navigating on.
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 15_000,
  });
}

test("creates a restaurant an owner can sign into and a customer can read", async ({
  page,
  sandbox,
}, testInfo) => {
  const slug = `e2e-new-${testInfo.project.name}-${testInfo.parallelIndex}`.toLowerCase();
  const ownerEmail = `owner@${slug}.test`;
  const ownerPassword = "brand-new-password-123";

  // Clean first, not only after: a killed previous run leaves the slug taken,
  // and the console would correctly refuse to create it again.
  await dropRestaurant(slug, ownerEmail);

  try {
    await signIn(page, OPERATOR_EMAIL, SANDBOX_PASSWORD);
    await page.goto(`${ADMIN}/operator/new`);

    await page.getByLabel("Restaurant name").fill(`E2E New ${testInfo.parallelIndex}`);
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Initial password").fill(ownerPassword);
    await page.getByLabel(/example menu/i).check();
    await page.getByRole("button", { name: "Create restaurant" }).click();

    // Landed on the new restaurant's page, with a verified address.
    await expect(page.getByText(`${slug}.localhost`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Verified")).toBeVisible();

    // The customer's view, on an address that did not exist a moment ago.
    await page.goto(`http://${slug}.localhost:${PORT}`);
    await expect(page.getByRole("heading", { name: "Hummus" })).toBeVisible();

    // The owner signs in with the password the operator just set, and lands on
    // their own menu. This is what replaces scripts/create-admin.ts.
    await signIn(page, ownerEmail, ownerPassword);
    await expect(page.getByText("Hummus")).toBeVisible();

    // ...and cannot reach the console.
    await page.goto(`${ADMIN}/operator`);
    await expect(page.getByRole("heading", { name: "Restaurants" })).toHaveCount(0);
  } finally {
    await dropRestaurant(slug, ownerEmail);
  }
});

test("lets the operator work inside a restaurant, with a way out", async ({
  page,
  sandbox,
}) => {
  await signIn(page, OPERATOR_EMAIL, SANDBOX_PASSWORD);
  await page.goto(`${ADMIN}/operator/${sandbox.id}`);

  await page.getByRole("button", { name: /^Sign in as / }).click();

  // The banner is the safety feature: the hazard is forgetting you are inside
  // a client's live menu.
  await expect(page.getByText(/You are working inside/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Hummus")).toBeVisible();

  await page.getByRole("button", { name: "Leave" }).click();
  await page.waitForURL(/\/operator/, { timeout: 15_000 });
  await expect(page.getByText(/You are working inside/)).toHaveCount(0);
});
```

- [ ] **Step 3: Run this spec on its own server**

Stop any preview server first. Then:

Run: `E2E_PORT=3100 npx playwright test operator --reporter=line`
Expected: PASS on both projects.

- [ ] **Step 4: Run the whole browser suite, twice**

Run: `E2E_PORT=3100 npm run test:e2e`
Expected: PASS. Then run it again — two consecutive green runs is the bar,
because a suite that only passes on a clean database will fail next time and be
blamed on the code.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/operator.spec.ts tests/e2e/support/sandbox.ts
git commit -m "Test the sale end to end: create a restaurant, owner signs in, customer reads it"
```

---

## Task 13: Documentation

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `docs/STATUS.md`**

- Phase 5 to Done in the state table; the blocker becomes deployment.
- Replace the "one thing blocking a sale" section: onboarding no longer needs
  SQL. What blocks a *paying* client now is that nothing is deployed — there is
  no host, so no customer can reach a site.
- Update test counts from the actual run.
- Update the getting-running section: `scripts/create-admin.ts` is still how you
  make the FIRST operator, but restaurants after that come from the console.
- Note under known gaps: DNS verification is manual and why.

- [ ] **Step 2: `docs/roadmap.md`**

- Phase 5 row to Done, listing what exists.
- In the phase detail, record the two deviations: **no automatic DNS
  verification** (nothing is deployed, so there is no address to point at — the
  seam is `attachDomain` in `core/platform/repository.ts`), and **custom CSS
  deliberately not built** (no client has asked; the column exists; it would
  need designing around the Phase 6 nonce CSP).
- Update the browser test count.

- [ ] **Step 3: `CLAUDE.md`**

Add only what carries a real consequence and was learned here:

- `core/platform/` takes a `Database`, not a `TenantSession` — these tables are
  outside RLS because they are read before a tenant context exists, so the
  `WHERE` clause **is** the isolation and every query must write it out.
- Platform-admin is **not** ambient access to a restaurant. Access requires a
  membership, or platform-admin plus actively impersonating that exact tenant.
- Creating a restaurant never overwrites an existing user's password.
- The platform subdomain is built with `platformSubdomain()`, which runs
  `PLATFORM_DOMAIN` through `normalizeHostname` — the stored hostname carries no
  port, and building it any other way makes a tenant unreachable.

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md docs/roadmap.md CLAUDE.md
git commit -m "Record where Phase 5 landed and what it deliberately left out"
```

---

## Task 14: Finish the branch

- [ ] **Step 1: Verify on the branch**

Run: `npm run verify`
Expected: PASS.

Run `E2E_PORT=3100 npm run test:e2e` twice. Both must pass.

- [ ] **Step 2: Merge and verify the merged tree**

```bash
git checkout main
git merge phase-5-operator-console
npm run verify
```

A green run on the branch proves only the tree it ran on, and the merged tree is
not that tree. Run the browser suite on the merged result too.

- [ ] **Step 3: Push and clean up**

```bash
git push origin main
git branch -d phase-5-operator-console
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| List every restaurant with status and primary domain | 2, 7 |
| Create restaurant + subdomain + owner + membership, one form | 3, 6, 7 |
| Subdomain created already verified | 3 |
| `RESERVED_SLUGS` enforced | 6 (via `isValidSlug`), 10 step 2.5 |
| Existing email reused, password untouched | 3 (asserted directly) |
| Example menu, in its own transaction, failure tolerated | 6 |
| Suspend / reactivate | 4, 8 |
| Attach domain, unverified; manual verify; remove | 4, 8 |
| Refuse removing the last domain | 4 |
| `normalizeHostname` on input | 6 |
| Impersonation: cookie, scoped, banner, way out | 1, 5, 6, 9 |
| Platform-admin alone is not access | 1, 5, 11 |
| Synthesised membership carries real name and currency | 5 |
| `requirePlatformAdmin` on every action | 6 |
| No `redirect()` from an action | 6, 7, 8, 9 |
| `/admin` no longer dead-ends an operator | 9 |
| Authorization matrix tested | 1, 11, 12 |
| E2E: onboard from nothing | 12 |
| DNS verification deferred, seam named, UI honest | 4 (comment), 8 (copy) |
| Custom CSS not built | Deliberately absent |

**Deviations from the spec, stated:**

1. **`requireMembership` returns a third field, `impersonating`.** The spec
   describes the rule but not the shape. Adding a field rather than changing one
   keeps every existing caller compiling untouched.
2. **`stopImpersonating` is deliberately not behind `requirePlatformAdmin`.**
   Leaving is always safe, and gating it would strand a session whose admin flag
   was removed while it was open.
3. **Task 10 is a manual pass with no deliverable of its own.** It exists
   because every real bug in this project has been found by loading the page,
   and a plan that ends at "the tests are green" would repeat that mistake.
4. **The initial-password field is `type="text"`, not `type="password"`.** The
   operator reads it aloud to the owner standing next to them; masking it helps
   nobody, and there is no email adapter to send an invitation instead.
