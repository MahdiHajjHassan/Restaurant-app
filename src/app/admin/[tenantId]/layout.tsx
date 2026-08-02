import Link from "next/link";
import { requireMembership } from "@/server/auth";
import { SignOutButton } from "../sign-out-button";

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
  const { membership } = await requireMembership(tenantId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pb-16">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-rule)] py-4">
        <div className="min-w-0">
          <p className="truncate font-display text-lg">
            {membership.tenantName}
          </p>
          <nav className="mt-1 flex gap-3 text-[0.8rem]">
            <Link
              href={`/${tenantId}`}
              className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              Menu
            </Link>
            <Link
              href={`/${tenantId}/hours`}
              className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              Hours
            </Link>
          </nav>
        </div>

        <SignOutButton />
      </header>

      {children}
    </div>
  );
}
