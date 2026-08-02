import { cache } from "react";
import {
  createContactRepository,
  toHourSegments,
  type ContactSettings,
} from "@/core/contact/repository";
import type { HourSegment } from "@/core/contact/hours";
import { withTenant } from "@/core/db/tenant";
import {
  createMenuRepository,
  type MenuCategory,
} from "@/core/menu/repository";
import { isServable, type Tenant } from "@/core/tenant/repository";
import { createThemeRepository } from "@/core/theme/repository";
import type { ResolvedTheme } from "@/core/theme/resolve";
import { db } from "./db";
import { getTenantByHost } from "./tenant";

export interface SiteData {
  menu: MenuCategory[];
  contact: ContactSettings | null;
  hours: HourSegment[];
  theme: ResolvedTheme;
}

/**
 * Everything a public tenant page renders, loaded in ONE tenant transaction.
 *
 * Opening a transaction per repository would mean setting the RLS context
 * several times per request for no benefit. Memoised with `cache()` so the
 * layout, the page, and generateMetadata share a single load rather than
 * repeating it three times.
 */
export const getSiteData = cache(async (tenantId: string): Promise<SiteData> => {
  return withTenant(db, tenantId, async (session) => {
    const menu = createMenuRepository(session);
    const contact = createContactRepository(session);

    // Sequential, not Promise.all: these share one transaction, and therefore
    // one connection, which cannot serve concurrent queries.
    const categories = await menu.getPublicMenu();
    const settings = await contact.getSettings();
    const hourRows = await contact.listOpeningHours();
    const theme = await createThemeRepository(session).getTheme();

    return {
      menu: categories,
      contact: settings,
      hours: toHourSegments(hourRows),
      theme,
    };
  });
});

export interface LoadedSite {
  tenant: Tenant;
  data: SiteData;
}

/**
 * Resolves a host and loads its site in one call, shared by both locale routes
 * and their metadata. Returns null for an unknown or suspended tenant so the
 * caller decides between a 404 and an explanation.
 */
export const loadSite = cache(
  async (host: string): Promise<LoadedSite | null> => {
    const tenant = await getTenantByHost(host);
    if (!tenant || !isServable(tenant)) return null;

    return { tenant, data: await getSiteData(tenant.id) };
  },
);
