import Link from "next/link";
import { listRestaurants } from "@/core/platform/repository";
import { requirePlatformAdmin } from "@/server/auth";
import { db } from "@/server/db";
import {
  Button,
  EmptyState,
  PageHeader,
  StatusBadge,
  spineFor,
} from "@/ui/console";

export default async function OperatorHome() {
  await requirePlatformAdmin();
  const restaurants = await listRestaurants(db);

  const suspended = restaurants.filter((r) => r.status === "suspended").length;

  if (restaurants.length === 0) {
    return (
      <main>
        <PageHeader title="Restaurants" />
        <EmptyState
          title="No restaurants yet"
          description="Create the first one and it will be live on its own address immediately."
          action={
            <Link href="/operator/new">
              <Button variant="primary">New restaurant</Button>
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        title="Restaurants"
        description={
          <>
            {restaurants.length}{" "}
            {restaurants.length === 1 ? "restaurant" : "restaurants"}
            {suspended > 0 ? ` · ${suspended} suspended` : null}
          </>
        }
        actions={
          <Link href="/operator/new">
            <Button variant="primary">New restaurant</Button>
          </Link>
        }
      />

      {/*
        A rail of tickets, not a list of links.

        The status spine on the leading edge is what makes this scannable: it
        answers "is anything down right now" before you have read a single
        word. The address is set in the mono face because it is an identifier
        someone compares character by character, not prose.
      */}
      <ul className="flex flex-col gap-2">
        {restaurants.map((restaurant) => (
          <li key={restaurant.id}>
            <Link
              href={`/operator/${restaurant.id}`}
              className={`spine spine-${spineFor(restaurant.status)} flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 hover:border-[var(--c-border-strong)] hover:bg-[var(--c-surface-sunk)] sm:flex-nowrap`}
            >
              <span className="min-w-0 flex-1 truncate text-[0.975rem] font-semibold">
                {restaurant.name}
              </span>
              <span className="identifier min-w-0 flex-1 truncate text-[0.8rem] text-[var(--c-text-muted)]">
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
