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
        <span role="alert" className="text-[0.7rem] text-[var(--color-muted)]">
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
        className={`rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors disabled:opacity-60 ${
          available
            ? "border-[var(--color-rule)] text-[var(--color-muted)]"
            : "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
        }`}
      >
        {available ? "Available" : "Sold out"}
      </button>
    </span>
  );
}
