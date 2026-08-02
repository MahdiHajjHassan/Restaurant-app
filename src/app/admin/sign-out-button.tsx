"use client";

import { useTransition } from "react";
import { signOutAction } from "./actions";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOutAction();
          // Full navigation, so the request passes through the host rewrite and
          // so no stale authenticated page survives in the router cache.
          window.location.assign("/login");
        })
      }
      className="shrink-0 rounded-full border border-[var(--color-rule)] px-3 py-1 text-[0.8rem] text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
