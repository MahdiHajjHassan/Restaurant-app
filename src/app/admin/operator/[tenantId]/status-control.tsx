"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setRestaurantStatus } from "../actions";

const STATUSES = ["trial", "active", "suspended"] as const;

/*
 * Each state carries the colour it means everywhere else in the console, so
 * the selected one reads as the status rather than merely as the pressed
 * button -- and "active" therefore carries no colour at all, matching its badge
 * in the list. A serving restaurant is the normal case, and colour here is
 * reserved for the states that want an operator's attention.
 */
const SELECTED: Record<(typeof STATUSES)[number], string> = {
  trial: "border-[var(--c-warn)] bg-[var(--c-warn-soft)] text-[var(--c-warn)]",
  active:
    "border-[var(--c-border-strong)] bg-[var(--c-brand-soft)] text-[var(--c-text)]",
  suspended:
    "border-[var(--c-danger)] bg-[var(--c-danger-soft)] text-[var(--c-danger)]",
};

/**
 * Suspending is how a non-paying client is switched off. It is deliberately
 * reversible and deliberately not deletion: ON DELETE CASCADE reaches every
 * table a client owns, and nobody needs that yet.
 */
export function StatusControl({
  tenantId,
  status,
}: {
  tenantId: string;
  status: (typeof STATUSES)[number];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STATUSES.map((option) => {
        const selected = option === status;
        return (
          <button
            key={option}
            type="button"
            disabled={pending || selected}
            aria-pressed={selected}
            aria-label={`Set status to ${option}`}
            onClick={() =>
              startTransition(async () => {
                const result = await setRestaurantStatus(tenantId, option);
                if (result.error) setError(result.error);
                router.refresh();
              })
            }
            className={`min-h-11 rounded-lg border px-4 py-2 text-[0.85rem] font-medium capitalize disabled:opacity-100 ${
              selected
                ? SELECTED[option]
                : "border-[var(--c-border-strong)] bg-[var(--c-surface)] text-[var(--c-text-muted)] hover:bg-[var(--c-surface-sunk)] hover:text-[var(--c-text)]"
            }`}
          >
            {option}
          </button>
        );
      })}
      {error ? (
        <p
          role="alert"
          className="basis-full text-[0.8rem] text-[var(--c-danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
