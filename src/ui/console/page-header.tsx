import type { ReactNode } from "react";

/**
 * The top of a console screen.
 *
 * Page titles used to render at `text-lg` against `0.95rem` body text, which is
 * barely a difference, so nothing led the eye down the page. The heading level
 * stays h1 -- the browser suite finds several screens by their heading.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-prose text-[0.875rem] text-[var(--c-text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
