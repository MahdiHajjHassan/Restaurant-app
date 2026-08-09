"use client";

import { useTransition } from "react";
import { stopImpersonating } from "../operator/actions";

/**
 * Unmissable on purpose.
 *
 * The whole hazard of impersonation is forgetting you are doing it and editing
 * a client's live menu believing it is the demo. A subtle indicator would
 * defeat the point.
 */
export function ImpersonationBanner({
  restaurantName,
}: {
  restaurantName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="status"
      className="-mx-5 flex flex-wrap items-center justify-between gap-3 bg-[var(--color-accent)] px-5 py-2 text-[var(--color-on-accent)]"
    >
      <span className="text-[0.8rem]">
        You are working inside <strong>{restaurantName}</strong>. Changes are
        theirs.
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await stopImpersonating();
            if (result.target) window.location.assign(result.target);
          })
        }
        className="rounded-md border border-[var(--color-on-accent)] px-2.5 py-1 text-[0.75rem] disabled:opacity-60"
      >
        {pending ? "Leaving…" : "Leave"}
      </button>
    </div>
  );
}
