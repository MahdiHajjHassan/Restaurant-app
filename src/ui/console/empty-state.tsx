import type { ReactNode } from "react";

/**
 * An empty screen, as an invitation rather than a dead end.
 *
 * Says what is missing and offers the one action that fixes it. No icon: this
 * console has no icon language, and inventing one for empty states alone would
 * be decoration.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-6 py-12 text-center">
      <p className="text-[1rem] font-semibold">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] text-[var(--c-text-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
