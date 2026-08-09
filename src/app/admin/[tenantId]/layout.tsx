import Link from "next/link";
import { requireMembership } from "@/server/auth";
import { SignOutButton } from "../sign-out-button";
import { ImpersonationBanner } from "./impersonation-banner";

export default async function TenantAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  // Guards every page beneath this route. Individual Server Actions repeat the
  // check, because an action can be invoked without this layout ever running.
  const { membership, impersonating } = await requireMembership(tenantId);

  const navLink =
    "rounded-lg px-3 py-2 text-[0.85rem] font-medium text-[var(--c-text-muted)] hover:bg-[var(--c-surface-sunk)] hover:text-[var(--c-text)]";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-20">
      {impersonating ? (
        <ImpersonationBanner restaurantName={membership.tenantName} />
      ) : null}

      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--c-border)] py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <p className="truncate text-[1.05rem] font-semibold">
            {membership.tenantName}
          </p>
          {/* Nav sits beside the name rather than under it: with three
              destinations a second row of chrome costs more than it earns. */}
          <nav className="-mx-1 flex items-center gap-0.5">
            <Link href={`/${tenantId}`} className={navLink}>
              Menu
            </Link>
            <Link href={`/${tenantId}/hours`} className={navLink}>
              Hours
            </Link>
            {/* "Look", not "Theme" -- restaurant owners are not designers, and
                the word should describe what they are about to change. */}
            <Link href={`/${tenantId}/theme`} className={navLink}>
              Look
            </Link>
          </nav>
        </div>

        <SignOutButton />
      </header>

      {children}
    </div>
  );
}
