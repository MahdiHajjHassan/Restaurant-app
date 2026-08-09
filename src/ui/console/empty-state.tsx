import type { ReactNode } from "react";

/**
 * An empty screen, as an invitation rather than a dead end.
 *
 * Says what is missing and offers the one action that fixes it. No icon: this
 * console has no icon language, and inventing one for empty states alone would
 * be decoration.
 *
 * The title is a real HEADING, not styled text. An empty state is often the
 * only thing on its screen, so it is what a screen reader lands on and what a
 * test finds by role -- `menu-builder.spec` looks for a heading matching
 * "build your menu". Rendering it as a <p> silently removed the page's only
 * landmark.
 */
export function EmptyState({
  title,
  description,
  action,
  /** 1 when this is the whole screen, 2 when it sits beneath a PageHeader. */
  headingLevel = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div className="rounded-xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-6 py-12 text-center">
      <Heading className="text-[1.15rem] font-semibold">{title}</Heading>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] text-[var(--c-text-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
