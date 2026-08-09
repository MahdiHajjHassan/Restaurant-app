import Link from "next/link";
import { requirePlatformAdmin } from "@/server/auth";
import { SignOutButton } from "../sign-out-button";

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guards every page beneath this route. Individual Server Actions repeat the
  // check, because an action can be invoked without this layout ever running.
  await requirePlatformAdmin();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-16">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-rule)] py-4">
        <div className="min-w-0">
          <p className="truncate font-display text-lg">Platform</p>
          <nav className="mt-1 flex gap-3 text-[0.8rem]">
            <Link
              href="/operator"
              className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              Restaurants
            </Link>
            <Link
              href="/operator/new"
              className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              New restaurant
            </Link>
          </nav>
        </div>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
