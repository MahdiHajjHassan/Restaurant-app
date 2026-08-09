import type { ReactNode } from "react";

/**
 * A labelled control.
 *
 * Every form in the console repeated the same four lines of Tailwind, and they
 * had drifted: some labels were 0.8rem muted, some 0.85rem, some inputs had a
 * different padding. This is one place to change how the console asks for
 * something.
 *
 * The label text itself is never touched by this component. The browser suite
 * finds controls by their accessible name -- `getByLabel("Price (USD)", {
 * exact: true })` and fifteen others -- so wrapping a control must not rename
 * it, and `exact` means even a stray character breaks the match.
 */

interface FieldProps {
  label: ReactNode;
  /** Wire to the control's id when the control is not a direct child. */
  htmlFor?: string;
  hint?: ReactNode;
  /** Shown in the danger colour beneath the control. */
  error?: ReactNode;
  /** Marks the label, for forms where most fields are optional. */
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** The console's input styling, for the many places that render a bare input. */
export const inputClassName =
  "w-full min-h-11 rounded-lg border border-[var(--c-border-strong)] bg-[var(--c-surface)] px-3 py-2.5 text-[0.9rem] text-[var(--c-text)] placeholder:text-[var(--c-text-subtle)] focus:border-[var(--c-brand)]";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className = "",
  children,
}: FieldProps) {
  const body = (
    <>
      <span className="flex items-baseline gap-1.5 text-[0.8rem] font-medium text-[var(--c-text-muted)]">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-[var(--c-danger)]">
            *
          </span>
        ) : null}
      </span>
      {children}
      {hint ? (
        <span className="text-[0.75rem] text-[var(--c-text-subtle)]">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="text-[0.75rem] text-[var(--c-danger)]">{error}</span>
      ) : null}
    </>
  );

  // A <label> wrapping its control needs no id; when the control is a group
  // (radios, a fieldset) the caller passes htmlFor and this renders a div.
  return htmlFor ? (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="contents">
        {body}
      </label>
    </div>
  ) : (
    <label className={`flex flex-col gap-1.5 ${className}`}>{body}</label>
  );
}
