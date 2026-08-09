import Link from "next/link";
import { listRestaurants } from "@/core/platform/repository";
import { requirePlatformAdmin } from "@/server/auth";
import { db } from "@/server/db";
import {
  ButtonLink,
  EmptyState,
  PageHeader,
  StatusBadge,
  spineFor,
} from "@/ui/console";

export default async function OperatorHome() {
  await requirePlatformAdmin();
  const restaurants = await listRestaurants(db);

  if (restaurants.length === 0) {
    return (
      <main className="pb-10">
        <PageHeader title="Restaurants" />
        <EmptyState
          title="No restaurants yet"
          description="Create the first one and it will be live on its own address immediately."
          action={
            <ButtonLink variant="primary" href="/operator/new">
              New restaurant
            </ButtonLink>
          }
        />
      </main>
    );
  }

  const suspended = restaurants.filter((r) => r.status === "suspended").length;

  return (
    <main className="pb-10">
      <PageHeader
        title="Restaurants"
        description={
          suspended > 0
            ? `${restaurants.length} restaurants, ${suspended} suspended.`
            : `${restaurants.length} restaurants, all serving.`
        }
        actions={
          <ButtonLink variant="primary" href="/operator/new">
            New restaurant
          </ButtonLink>
        }
      />

      {/*
       * A rail of tickets rather than a table.
       *
       * The status spine on the leading edge is what makes this list readable
       * at a glance: previously every restaurant carried the same grey pill, so
       * the one fact that matters -- can customers reach this site right now --
       * was the hardest thing on the screen to see.
       */}
      <ul className="flex flex-col gap-2">
        {restaurants.map((restaurant) => (
          <li key={restaurant.id}>
            <Link
              href={`/operator/${restaurant.id}`}
              className={`spine spine-${spineFor(restaurant.status)} flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 hover:border-[var(--c-border-strong)] hover:bg-[var(--c-surface-sunk)]`}
            >
              <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium">
                {restaurant.name}
              </span>
              {/* The address is an identifier someone compares character by
                  character, so it is set in the mono face. */}
              <span className="identifier min-w-0 truncate text-[0.8rem] text-[var(--c-text-muted)]">
                {restaurant.primaryDomain ?? "no address"}
              </span>
              <StatusBadge status={restaurant.status} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
