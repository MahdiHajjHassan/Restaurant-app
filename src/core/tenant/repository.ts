import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { domains, tenants } from "../db/schema";
import { normalizeHostname } from "./hostname";

export type Tenant = typeof tenants.$inferSelect;

/**
 * Host-to-tenant resolution.
 *
 * Deliberately NOT tenant-scoped: it runs before a tenant context can exist,
 * which is precisely why `tenants` and `domains` are excluded from RLS. Neither
 * holds cross-tenant customer data -- only the hostname mapping and a
 * restaurant's own public configuration.
 *
 * Only VERIFIED domains resolve. Without that check anyone could point their
 * DNS at the platform and serve someone else's restaurant under a lookalike
 * domain.
 */
export async function findTenantByHostname(
  db: Database,
  host: string,
): Promise<Tenant | null> {
  const hostname = normalizeHostname(host);
  if (hostname.length === 0) return null;

  const rows = await db
    .select({ tenant: tenants })
    .from(domains)
    .innerJoin(tenants, eq(domains.tenantId, tenants.id))
    .where(and(eq(domains.hostname, hostname), isNotNull(domains.verifiedAt)))
    .limit(1);

  return rows[0]?.tenant ?? null;
}

export async function findTenantBySlug(
  db: Database,
  slug: string,
): Promise<Tenant | null> {
  const rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug.toLowerCase()))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * A suspended tenant must not serve its menu, but it also must not 404 -- the
 * owner needs to understand why their site went dark, and a 404 tells them
 * nothing. Callers branch on this to render an explanatory page.
 */
export function isServable(tenant: Tenant): boolean {
  return tenant.status !== "suspended";
}
