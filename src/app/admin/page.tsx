import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth";

export default async function AdminHome() {
  const { memberships } = await requireSession();

  if (memberships.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3 px-6 py-16 text-center">
        <h1 className="font-display text-xl">No restaurant yet</h1>
        <p className="text-[0.85rem] text-[var(--color-muted)]">
          Your account is not linked to a restaurant. Ask whoever set this up to
          add you.
        </p>
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
      <h1 className="font-display text-xl">Choose a restaurant</h1>
      <ul className="flex flex-col gap-px overflow-hidden rounded-lg border border-[var(--color-rule)] bg-[var(--color-rule)]">
        {memberships.map((membership) => (
          <li key={membership.tenantId}>
            <Link
              href={`/${membership.tenantId}`}
              className="flex items-baseline justify-between bg-[var(--color-paper)] px-4 py-3 hover:bg-[var(--color-paper-sunk)]"
            >
              <span className="font-medium">{membership.tenantName}</span>
              <span className="text-[0.75rem] text-[var(--color-muted)] uppercase">
                {membership.role}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
