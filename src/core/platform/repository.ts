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
