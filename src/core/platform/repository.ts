import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { domains, memberships, tenants, users } from "../db/schema";

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
  return db
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
 * pointing THEIR DNS at us and serving a lookalike; a name we issued to
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
): Promise<
  { ok: true; domainId: string } | { ok: false; reason: "hostname-taken" }
> {
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
 * Filters on tenantId as well as the domain id, here and in removeDomain.
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

    if (all.length <= 1) {
      return { ok: false as const, reason: "last-domain" as const };
    }

    await tx
      .delete(domains)
      .where(and(eq(domains.tenantId, tenantId), eq(domains.id, domainId)));

    return { ok: true as const };
  });
}
