import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantByHost } from "@/server/tenant";

type SiteParams = { params: Promise<{ host: string }> };

export async function generateMetadata({
  params,
}: SiteParams): Promise<Metadata> {
  const { host } = await params;
  const tenant = await getTenantByHost(decodeURIComponent(host));

  // Per-tenant metadata from day one: being found on Google is a large part of
  // what a restaurant is actually buying.
  return tenant ? { title: tenant.name } : {};
}

/**
 * Tenant home. Phase 2 replaces this with the menu -- categories, item cards,
 * sticky category nav, and the Open now badge.
 */
export default async function TenantHome({ params }: SiteParams) {
  const { host } = await params;
  const tenant = await getTenantByHost(decodeURIComponent(host));
  if (!tenant) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm font-medium tracking-wide text-[var(--color-accent)] uppercase">
          Resolved tenant
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{tenant.name}</h1>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {(
          [
            ["Slug", tenant.slug],
            ["Status", tenant.status],
            ["Currency", tenant.currency],
            ["Timezone", tenant.timezone],
            ["Default locale", tenant.defaultLocale],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[var(--color-muted)]">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-[var(--color-muted)]">
        The menu lands in Phase 2.
      </p>
    </main>
  );
}
