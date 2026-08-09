import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/core/auth/password";
import { createDatabase, type Database } from "@/core/db/client";
import {
  attachDomain,
  createRestaurant,
  findRestaurant,
  listRestaurants,
  removeDomain,
  setDomainVerified,
  setRestaurantStatus,
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
    expect(
      await verifyPassword("their-real-password", rows[0]!.password_hash),
    ).toBe(true);
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

    const attached = await attachDomain(
      db,
      tenantId,
      `custom-attach.${PREFIX}.test`,
    );
    expect(attached.ok).toBe(true);

    const detail = await findRestaurant(db, tenantId);
    const custom = detail?.domains.find((d) =>
      d.hostname.startsWith("custom-attach"),
    );
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
    const attached = await attachDomain(
      db,
      tenantId,
      `custom-verify.${PREFIX}.test`,
    );
    if (!attached.ok) throw new Error("attach failed");

    expect(await setDomainVerified(db, tenantId, attached.domainId, true)).toBe(
      true,
    );
    let detail = await findRestaurant(db, tenantId);
    expect(
      detail?.domains.find((d) => d.id === attached.domainId)?.verifiedAt,
    ).not.toBeNull();

    expect(await setDomainVerified(db, tenantId, attached.domainId, false)).toBe(
      true,
    );
    detail = await findRestaurant(db, tenantId);
    expect(
      detail?.domains.find((d) => d.id === attached.domainId)?.verifiedAt,
    ).toBeNull();
  });

  it("will not let one restaurant touch another's domain", async () => {
    const mine = await makeRestaurant("scope-mine");
    const theirs = await makeRestaurant("scope-theirs");
    const attached = await attachDomain(
      db,
      theirs,
      `custom-scope.${PREFIX}.test`,
    );
    if (!attached.ok) throw new Error("attach failed");

    // There is no RLS beneath this module, so the tenantId filter in the
    // query is the ONLY thing scoping it. Assert it is really there.
    expect(await setDomainVerified(db, mine, attached.domainId, true)).toBe(
      false,
    );
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
    const attached = await attachDomain(
      db,
      tenantId,
      `custom-remove.${PREFIX}.test`,
    );
    if (!attached.ok) throw new Error("attach failed");

    expect(await removeDomain(db, tenantId, attached.domainId)).toEqual({
      ok: true,
    });
    expect((await findRestaurant(db, tenantId))?.domains).toHaveLength(1);
  });
});
