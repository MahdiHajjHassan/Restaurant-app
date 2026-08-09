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
