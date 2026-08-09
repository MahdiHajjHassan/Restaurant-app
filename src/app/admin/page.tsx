import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth";
import { EmptyState } from "@/ui/console";

export default async function AdminHome() {
  const { user, memberships } = await requireSession();

  if (memberships.length === 0) {
    // A platform operator legitimately has no memberships. Sending them to a
    // dead end that says "ask whoever set this up" -- when that is them -- is
    // the kind of small wrongness that makes a product feel unfinished.
    if (user.isPlatformAdmin) redirect("/operator");

    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
        <EmptyState
          headingLevel={1}
          title="No restaurant yet"
          description="Your account is not linked to a restaurant. Ask whoever set this up to add you."
        />
      </main>
    );
  }

  // Most owners have exactly one restaurant. Making them pick from a list of
  // one is a step that exists only for the rare case.
  if (memberships.length === 1 && memberships[0]) {
    redirect(`/${memberships[0].tenantId}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">
        Choose a restaurant
      </h1>

      {user.isPlatformAdmin ? (
        <Link
          href="/operator"
          className="-mt-3 text-[0.85rem] font-medium text-[var(--c-brand)] hover:underline"
        >
          Platform console →
        </Link>
      ) : null}

      <ul className="overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
        {memberships.map((membership) => (
          <li
            key={membership.tenantId}
            className="border-b border-[var(--c-border)] last:border-b-0"
          >
            <Link
              href={`/${membership.tenantId}`}
              className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--c-surface-sunk)]"
            >
              <span className="truncate font-medium">
                {membership.tenantName}
              </span>
              <span className="shrink-0 text-[0.7rem] font-semibold tracking-wide text-[var(--c-text-subtle)] uppercase">
                {membership.role}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
