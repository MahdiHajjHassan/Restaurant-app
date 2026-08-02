import { NextResponse, type NextRequest } from "next/server";
import { normalizeHostname } from "@/core/tenant/hostname";

/**
 * Host-based routing.
 *
 * (Next 16 renamed this file convention from `middleware` to `proxy`.)
 *
 * This does exactly one thing: map a hostname onto a route segment. It never
 * touches the database. It runs on every request and can run at the edge, so a
 * query here would tax each request with a round trip and make the entire
 * platform unavailable whenever the database blinks. Real tenant resolution
 * happens inside the route, where it can be cached and where a failure degrades
 * one restaurant's site instead of all of them.
 *
 * Routing rules:
 *   platform domain -> the platform's own pages
 *   app.<platform>  -> the admin console, on ONE origin so session cookies are
 *                      never scoped to a tenant's domain
 *   anything else   -> a tenant site, resolved by hostname
 */

/**
 * Internal route prefix that tenant hosts are rewritten onto.
 *
 * It cannot be an underscore-prefixed folder: Next treats those as private and
 * excludes them from routing, so the rewrite target would 404. Since the
 * segment therefore has to be publicly nameable, requests arriving that ask for
 * it directly are refused below -- it is reachable only by rewrite.
 */
const SITES_PREFIX = "/sites";

export default function proxy(request: NextRequest) {
  const host = normalizeHostname(request.headers.get("host") ?? "");
  const platformDomain = normalizeHostname(process.env.PLATFORM_DOMAIN ?? "");
  const { pathname } = request.nextUrl;

  if (host.length === 0) {
    return new NextResponse("Missing Host header", { status: 400 });
  }

  // Rewrites do not re-enter this function, so anything arriving here already
  // pointing at the internal prefix came from outside. Refuse it, rather than
  // letting a visitor address any tenant by path and sidestep host verification.
  if (pathname === SITES_PREFIX || pathname.startsWith(`${SITES_PREFIX}/`)) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (host === platformDomain) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();

  if (platformDomain.length > 0 && host === `app.${platformDomain}`) {
    url.pathname = `/admin${pathname}`;
    return NextResponse.rewrite(url);
  }

  // The hostname travels in the path so the route can resolve it. The visitor's
  // URL is untouched -- this is a rewrite, not a redirect.
  url.pathname = `${SITES_PREFIX}/${encodeURIComponent(host)}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  /*
   * Only genuine internals are excluded.
   *
   * The obvious matcher also skips "anything that looks like a file" via a
   * trailing-extension pattern -- but hostnames contain dots, so
   * /sites/alpha-grill.localhost matched it and bypassed this function
   * entirely, leaving the internal prefix directly reachable. Every request
   * that is not a Next internal or a stored upload must pass through here.
   */
  matcher: ["/((?!_next/|storage/|favicon\\.ico).*)"],
};
