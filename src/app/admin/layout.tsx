import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  // The console must never be indexed, on any route beneath it.
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * `console` scopes the workspace token set in globals.css to everything
   * beneath /admin. The public menu keeps the paper palette it was designed
   * around; nothing here reaches it.
   *
   * The background is painted here rather than on <body> for the same reason
   * the tenant page paints its own: the tokens are scoped to this element, so
   * the element has to use them.
   */
  return (
    <div className="console flex min-h-full flex-1 flex-col bg-[var(--c-bg)] text-[var(--c-text)]">
      {children}
    </div>
  );
}
