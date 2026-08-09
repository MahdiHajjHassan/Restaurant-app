import { NextResponse } from "next/server";
import { IMPERSONATION_COOKIE } from "@/core/auth/impersonation";

/**
 * Stop impersonating, as a real HTTP navigation.
 *
 * Deliberately a route handler rather than a Server Action.
 *
 * Clearing the cookie removes the caller's access to the very page they are
 * standing on. A Server Action re-renders the current route as part of its
 * response, so that render would call `requireMembership`, correctly find no
 * access left, and throw its own `redirect("/")` -- which then races whatever
 * navigation the client was trying to perform, and usually wins. The operator
 * lands on the platform home page instead of the console, intermittently,
 * depending on which side of the race finishes first.
 *
 * A GET that answers 303 has no such race: the cookie is cleared and the
 * browser is sent to the console in one response, before anything re-renders.
 *
 * Reached with a plain <a>, not next/link, so Next does not prefetch it and
 * end an impersonation the operator is still using.
 */
export function GET(request: Request): NextResponse {
  const response = NextResponse.redirect(new URL("/operator", request.url), {
    // 303 rather than 307: this is not a redirect of a submission, it is
    // "your business here is done, go and look at that instead".
    status: 303,
  });

  response.cookies.delete(IMPERSONATION_COOKIE);
  return response;
}
