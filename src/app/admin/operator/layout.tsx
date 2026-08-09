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

  const navLink =
    "rounded-lg px-3 py-2 text-[0.85rem] font-medium text-[var(--c-text-muted)] hover:bg-[var(--c-surface-sunk)] hover:text-[var(--c-text)]";

  return (
    /*
     * Wider than the owner's console. This screen lists every restaurant on the
     * platform with its address and status, and squeezing three columns into a
     * reading measure was throwing away the operator's screen.
     */
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--c-border)] py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <p className="truncate text-[1.05rem] font-semibold">Platform</p>
          <nav className="-mx-1 flex items-center gap-0.5">
            <Link href="/operator" className={navLink}>
              Restaurants
            </Link>
            <Link href="/operator/new" className={navLink}>
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
