"use server";

import { attemptLogin } from "@/server/auth";

export interface LoginState {
  error: string | null;
  /** Where the browser should go on success. See the note below. */
  redirectTo?: string;
}

/**
 * Signs in and tells the client where to go.
 *
 * Deliberately NOT using redirect(). The admin is served by rewriting the
 * app.<platform> host onto /admin, and redirect() inside a Server Action
 * performs a CLIENT-side navigation: the router resolves "/" against the
 * app's own route tree and lands on the platform home page, because it has no
 * knowledge of the host rewrite. A full navigation re-issues a real request,
 * which goes through the proxy and resolves correctly.
 */
export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const result = await attemptLogin(email, password);

  if (!result.ok) {
    return {
      error:
        result.reason === "rate-limited"
          ? "Too many attempts. Wait 15 minutes and try again."
          : // Same message for an unknown email and a wrong password, so this
            // form cannot be used to discover which emails have accounts.
            "That email and password do not match.",
    };
  }

  return { error: null, redirectTo: "/" };
}
