"use client";

import { useState, useTransition } from "react";
import { startImpersonating } from "../actions";

export function ImpersonateButton({
  tenantId,
  restaurantName,
}: {
  tenantId: string;
  restaurantName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-8 border-t border-[var(--color-rule)] pt-5">
      <h2 className="font-display text-base">Support</h2>
      <p className="mt-1 max-w-prose text-[0.8rem] text-[var(--color-muted)]">
        Open this restaurant&rsquo;s admin exactly as its owner sees it. Any
        change you make there is a change they will see.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startImpersonating(tenantId);
            if (result.error) {
              setError(result.error);
              return;
            }
            // window.location.assign, never redirect(): the admin is reached
            // by a host rewrite, and redirect() resolves against the app's own
            // route tree and lands on the platform home page.
            if (result.target) window.location.assign(result.target);
          })
        }
        className="mt-3 rounded-md border border-[var(--color-rule)] px-3 py-2 text-[0.85rem] disabled:opacity-60"
      >
        {pending ? "Opening…" : `Sign in as ${restaurantName}`}
      </button>

      {error ? (
        <p role="alert" className="mt-2 text-[0.8rem]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
