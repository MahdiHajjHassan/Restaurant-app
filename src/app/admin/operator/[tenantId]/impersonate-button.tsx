"use client";

import { useState, useTransition } from "react";
import { Button, Panel } from "@/ui/console";
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
    <Panel
      title="Support"
      description="Open this restaurant’s admin exactly as its owner sees it. Any change you make there is a change they will see."
    >
      <Button
        type="button"
        pending={pending}
        pendingLabel="Opening…"
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
      >
        {`Sign in as ${restaurantName}`}
      </Button>

      {error ? (
        <p role="alert" className="mt-3 text-[0.8rem] text-[var(--c-danger)]">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
