import Link from "next/link";
import { notFound } from "next/navigation";
import { findRestaurant } from "@/core/platform/repository";
import { requirePlatformAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { PageHeader, Panel, StatusBadge } from "@/ui/console";
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
    <main>
      <Link
        href="/operator"
        className="mt-6 inline-block text-[0.825rem] font-medium text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
      >
        ← All restaurants
      </Link>

      <PageHeader
        title={restaurant.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="identifier">{restaurant.slug}</span>
            <span aria-hidden="true">·</span>
            <span>{restaurant.currency}</span>
            <span aria-hidden="true">·</span>
            <span>{restaurant.timezone}</span>
            <span aria-hidden="true">·</span>
            <span>
              {restaurant.defaultLocale === "ar" ? "Arabic" : "English"}
            </span>
          </span>
        }
        actions={<StatusBadge status={restaurant.status} />}
      />

      <div className="flex flex-col gap-4">
        <Panel
          title="Status"
          description="A suspended restaurant explains itself to visitors rather than disappearing. Nothing is deleted."
        >
          <StatusControl tenantId={restaurant.id} status={restaurant.status} />
        </Panel>

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
      </div>
    </main>
  );
}
