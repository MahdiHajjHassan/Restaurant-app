import { notFound } from "next/navigation";
import { isServable } from "@/core/tenant/repository";
import { getTenantByHost } from "@/server/tenant";

type SiteParams = { params: Promise<{ host: string }> };

export default async function SiteLayout({
  children,
  params,
}: SiteParams & { children: React.ReactNode }) {
  const { host } = await params;
  const tenant = await getTenantByHost(decodeURIComponent(host));

  // An unknown hostname is a genuine 404: someone pointed DNS here for a site
  // that does not exist, or the domain was never verified.
  if (!tenant) notFound();

  /*
   * A suspended tenant gets an explanation rather than a 404.
   *
   * The person most likely to hit this page is the restaurant owner whose site
   * just went dark, and a 404 would tell them their site was deleted. Saying
   * "temporarily unavailable" turns a support panic into a billing conversation.
   */
  if (!isServable(tenant)) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">{tenant.name}</h1>
        <p className="text-[var(--color-muted)]">
          This site is temporarily unavailable. If you are the owner, please get
          in touch to restore it.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
