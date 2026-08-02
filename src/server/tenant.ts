import { cache } from "react";
import { findTenantByHostname, type Tenant } from "@/core/tenant/repository";
import { db } from "./db";

/**
 * Resolves a hostname to a tenant, memoised for the lifetime of one request.
 *
 * `cache()` deduplicates within a single render pass -- the layout and the page
 * both need the tenant, and this makes that one query rather than two.
 *
 * Cross-request caching (a tagged entry per hostname, invalidated when the
 * owner edits their site) lands in Phase 2 alongside the menu data it will
 * protect. Adding it now would mean building an invalidation path with nothing
 * to invalidate.
 */
export const getTenantByHost = cache(
  async (host: string): Promise<Tenant | null> => {
    return findTenantByHostname(db, host);
  },
);
