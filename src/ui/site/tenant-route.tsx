import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localizedOptional, type Locale } from "@/core/i18n/locale";
import { loadSite } from "@/server/site";
import { SitePage } from "./site-page";

export type TenantRouteParams = { params: Promise<{ host: string }> };

/**
 * Shared body of the two locale routes.
 *
 * English and Arabic are separate route files rather than one dynamic segment:
 * with exactly two locales that is simpler and fully typed, and it matches the
 * decision that adding a third language is a deliberate migration rather than
 * a free addition.
 */
export async function renderTenantRoute(host: string, locale: Locale) {
  const site = await loadSite(decodeURIComponent(host));
  if (!site) notFound();

  const canonical = `https://${decodeURIComponent(host)}${locale === "ar" ? "/ar" : "/"}`;

  return (
    <SitePage
      tenant={site.tenant}
      data={site.data}
      locale={locale}
      url={canonical}
    />
  );
}

export async function buildTenantMetadata(
  host: string,
  locale: Locale,
): Promise<Metadata> {
  const decoded = decodeURIComponent(host);
  const site = await loadSite(decoded);
  if (!site) return {};

  const { tenant, data } = site;
  const address = data.contact
    ? localizedOptional(
        data.contact.addressEn,
        data.contact.addressAr,
        locale,
      )
    : null;

  // A description built from what the restaurant actually is, not boilerplate.
  const dishes = data.menu
    .flatMap((category) => category.items.slice(0, 2))
    .slice(0, 4)
    .map((item) => (locale === "ar" ? (item.nameAr ?? item.nameEn) : item.nameEn));

  const description = [address, dishes.join(" · ")]
    .filter(Boolean)
    .join(" — ");

  const base = `https://${decoded}`;

  return {
    title: tenant.name,
    description: description || undefined,
    // hreflang pairing: tells search engines these are the same page in two
    // languages rather than duplicate content competing with each other.
    alternates: {
      canonical: locale === "ar" ? `${base}/ar` : base,
      languages: { en: base, ar: `${base}/ar` },
    },
    openGraph: {
      title: tenant.name,
      description: description || undefined,
      url: locale === "ar" ? `${base}/ar` : base,
      type: "website",
      locale: locale === "ar" ? "ar_LB" : "en_US",
    },
  };
}
