import Link from "next/link";
import { listRestaurants } from "@/core/platform/repository";
import { requirePlatformAdmin } from "@/server/auth";
import { db } from "@/server/db";

export default async function OperatorHome() {
  await requirePlatformAdmin();
  const restaurants = await listRestaurants(db);

  if (restaurants.length === 0) {
    return (
      <main className="py-10">
        <h1 className="font-display text-lg">Restaurants</h1>
        <p className="mt-2 max-w-prose text-[0.85rem] text-[var(--color-muted)]">
          None yet. Create the first one and it will be live on its own address
          immediately.
        </p>
        <Link
          href="/operator/new"
          className="mt-4 inline-block rounded-md bg-[var(--color-accent)] px-4 py-2 text-[0.9rem] font-medium text-[var(--color-on-accent)]"
        >
          New restaurant
        </Link>
      </main>
    );
  }

  return (
    <main className="py-6">
      <h1 className="font-display text-lg">Restaurants</h1>

      <ul className="mt-4 divide-y divide-[var(--color-rule)]">
        {restaurants.map((restaurant) => (
          <li key={restaurant.id}>
            <Link
              href={`/operator/${restaurant.id}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
            >
              <span className="min-w-0 flex-1 truncate text-[0.95rem]">
                {restaurant.name}
              </span>
              <span className="truncate text-[0.8rem] text-[var(--color-muted)]">
                {restaurant.primaryDomain ?? "no address"}
              </span>
              <span className="shrink-0 rounded-sm border border-[var(--color-rule)] px-1.5 py-0.5 text-[0.65rem] tracking-wide text-[var(--color-muted)] uppercase">
                {restaurant.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
