import { normalizeHostname } from "@/core/tenant/hostname";
import { env } from "@/env";

/**
 * The hostname a new restaurant gets for free.
 *
 * PLATFORM_DOMAIN carries a port in development ("localhost:3000"), and the
 * `domains` table stores hostnames WITHOUT one -- normalizeHostname is what
 * the request path uses to strip it, so building the stored value through the
 * same function is what keeps the two spellings from drifting apart. A
 * hostname stored in a second spelling is a restaurant that silently cannot
 * be reached.
 *
 * Reading env here rather than in core/ is the composition-root rule: core
 * receives its configuration, it never goes looking for it.
 */
export function platformSubdomain(slug: string): string {
  return `${slug}.${normalizeHostname(env.PLATFORM_DOMAIN)}`;
}
