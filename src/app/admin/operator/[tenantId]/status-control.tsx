"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setRestaurantStatus } from "../actions";

const STATUSES = ["trial", "active", "suspended"] as const;

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
      {STATUSES.map((option) => (
        <button
          key={option}
          type="button"
          disabled={pending || option === status}
          aria-label={`Set status to ${option}`}
          onClick={() =>
            startTransition(async () => {
              const result = await setRestaurantStatus(tenantId, option);
              if (result.error) setError(result.error);
              router.refresh();
            })
          }
          className={`rounded-md border px-3 py-1.5 text-[0.8rem] capitalize disabled:opacity-100 ${
            option === status
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
              : "border-[var(--color-rule)] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          {option}
        </button>
      ))}
      {error ? (
        <p role="alert" className="basis-full text-[0.8rem]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
