"use client";

import { useState, useTransition } from "react";
import { setItemAvailability } from "./actions";

interface AvailabilityToggleProps {
  tenantId: string;
  itemId: string;
  itemName: string;
  isAvailable: boolean;
}

/**
 * The control owners touch every day: mark tonight's fish sold out in one tap,
 * standing in a kitchen, on a phone.
 *
 * State flips immediately and rolls back if the server rejects it. Waiting for
 * a round trip before showing the change makes a fast action feel broken on a
 * bad connection, which is exactly where this gets used.
 */
export function AvailabilityToggle({
  tenantId,
  itemId,
  itemName,
  isAvailable,
}: AvailabilityToggleProps) {
  const [available, setAvailable] = useState(isAvailable);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !available;
    setAvailable(next);
    setFailed(false);

    startTransition(async () => {
      try {
        await setItemAvailability(tenantId, itemId, next);
      } catch {
        // Roll back AND say so. Silently reverting would leave an owner
        // believing a dish is off the menu when it is still being ordered.
        setAvailable(!next);
        setFailed(true);
      }
    });
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      {failed ? (
        <span role="alert" className="text-[0.7rem] text-[var(--c-danger)]">
          Not saved
        </span>
      ) : null}

      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        role="switch"
        aria-checked={available}
        aria-label={`${itemName} available`}
        /*
         * Sold out is the loud state, not available.
         *
         * "Available" is every dish on a working menu, so it stays quiet;
         * sold out is the exception an owner needs to spot from across the
         * kitchen and put back.
         */
        className={`inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-[0.8rem] font-medium transition-colors disabled:opacity-55 ${
          available
            ? "border-[var(--c-border-strong)] bg-[var(--c-surface)] text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
            : "border-[var(--c-danger)] bg-[var(--c-danger-soft)] text-[var(--c-danger)]"
        }`}
      >
        {available ? "Available" : "Sold out"}
      </button>
    </span>
  );
}
