"use client";

import { useActionState, useEffect } from "react";
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
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[0.8rem] text-[var(--color-muted)]">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded-md border border-[var(--color-rule)] bg-transparent px-3 py-2.5 text-[0.95rem]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.8rem] text-[var(--color-muted)]">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-[var(--color-rule)] bg-transparent px-3 py-2.5 text-[0.95rem]"
        />
      </label>

      {state.error ? (
        // Errors say what happened and what to do, in the interface's voice.
        <p
          role="alert"
          className="rounded-md border border-[var(--color-rule)] px-3 py-2 text-[0.85rem]"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--color-accent)] px-4 py-2.5 text-[0.9rem] font-medium text-[var(--color-on-accent)] disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
