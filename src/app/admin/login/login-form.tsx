"use client";

import { useActionState, useEffect } from "react";
import { Button, Field, inputClassName } from "@/ui/console";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  // A full navigation, not router.push: the admin is reached by rewriting the
  // app.<platform> host onto /admin, and a client-side navigation resolves the
  // path against the app's route tree without applying that rewrite.
  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5"
    >
      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className={inputClassName}
        />
      </Field>

      <Field label="Password">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClassName}
        />
      </Field>

      {state.error ? (
        /*
         * Errors say what happened and what to do, in the interface's voice.
         * In the danger colour now rather than the same grey box as everything
         * else -- a failed sign-in should not look like a footnote.
         */
        <p
          role="alert"
          className="rounded-lg border border-[var(--c-danger)] bg-[var(--c-danger-soft)] px-3 py-2.5 text-[0.85rem] text-[var(--c-danger)]"
        >
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        pending={pending}
        pendingLabel="Signing in…"
        className="mt-1 w-full"
      >
        Sign in
      </Button>
    </form>
  );
}
