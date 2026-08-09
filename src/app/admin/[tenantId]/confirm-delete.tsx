"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MenuActionState } from "./actions";

interface ConfirmDeleteProps {
  /** Accessible name of the control that opens the confirmation. */
  label: string;
  /**
   * Names exactly what will go: "Delete Grills and its 14 dishes?"
   *
   * Never a generic "Are you sure?". Deleting a section cascades to every dish
   * under it, and on a phone that is one mis-tap away -- naming the cost is the
   * whole difference between full control and an accident.
   */
  question: string;
  onConfirm: () => Promise<MenuActionState>;
}

const ghost =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-transparent px-2.5 text-[0.8rem] font-medium text-[var(--c-text-muted)] hover:bg-[var(--c-surface-sunk)] hover:text-[var(--c-text)] disabled:opacity-35";

export function ConfirmDelete({
  label,
  question,
  onConfirm,
}: ConfirmDeleteProps) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!asking) {
    return (
      <span className="flex shrink-0 items-center gap-2">
        {error ? (
          <span role="alert" className="text-[0.7rem] text-[var(--c-danger)]">
            {error}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={label}
          onClick={() => {
            setError(null);
            setAsking(true);
          }}
          className={ghost}
        >
          Delete
        </button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <span className="text-[0.75rem]">{question}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await onConfirm();
            if (result.error) {
              setError(result.error);
              setAsking(false);
              return;
            }
            // Refresh explicitly rather than trusting the action's revalidate
            // to redraw a list this component does not own. One uniform rule
            // across every mutation control here, so nothing depends on
            // guessing which action shapes re-render and which do not.
            router.refresh();
          })
        }
        className="min-h-11 rounded-lg bg-[var(--c-danger)] px-3 text-[0.8rem] font-semibold text-white disabled:opacity-55"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setAsking(false)}
        className={ghost}
      >
        Cancel
      </button>
    </span>
  );
}
