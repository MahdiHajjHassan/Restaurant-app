import type { ReactNode } from "react";

/**
 * A raised surface with one job on it.
 *
 * The console had no surfaces at all -- every screen was one flat field with
 * hairlines between things -- so nothing was grouped and long forms read as an
 * undifferentiated column.
 *
 * `spine` colours the leading edge to carry state. It is a border rather than a
 * pseudo-element so it mirrors under RTL for free.
 */

export type Spine = "ok" | "warn" | "danger" | "muted" | null;

interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Controls aligned to the trailing edge of the header. */
  actions?: ReactNode;
  spine?: Spine;
  /** Removes the body padding, for panels whose child is a full-bleed list. */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

const SPINES: Record<NonNullable<Spine>, string> = {
  ok: "spine spine-ok",
  warn: "spine spine-warn",
  danger: "spine spine-danger",
  muted: "spine spine-muted",
};

export function Panel({
  title,
  description,
  actions,
  spine = null,
  flush = false,
  className = "",
  children,
}: PanelProps) {
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <section
      className={`overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] ${
        spine ? SPINES[spine] : ""
      } ${className}`}
    >
      {hasHeader ? (
        <header
          className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5 ${
            children ? "border-b border-[var(--c-border)]" : ""
          }`}
        >
          <div className="min-w-0">
            {title ? (
              <h2 className="truncate text-[0.95rem] font-semibold">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[0.8rem] text-[var(--c-text-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </header>
      ) : null}

      {children ? (
        <div className={flush ? "" : "px-4 py-4 sm:px-5"}>{children}</div>
      ) : null}
    </section>
  );
}
