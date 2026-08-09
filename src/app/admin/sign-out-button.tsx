"use client";

import { useTransition } from "react";
import { Button } from "@/ui/console";
import { signOutAction } from "./actions";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      pending={pending}
      pendingLabel="Signing out…"
      onClick={() =>
        startTransition(async () => {
          await signOutAction();
          // Full navigation, so the request passes through the host rewrite and
          // so no stale authenticated page survives in the router cache.
          window.location.assign("/login");
        })
      }
    >
      Sign out
    </Button>
  );
}
