"use server";

import { signOut } from "@/server/auth";

/**
 * Ends the session. The caller navigates afterwards.
 *
 * Same reason as loginAction: redirect() from a Server Action is a client-side
 * navigation, and the admin is reached by rewriting the app.<platform> host
 * onto /admin, which a client-side navigation does not apply.
 */
export async function signOutAction(): Promise<void> {
  await signOut();
}
