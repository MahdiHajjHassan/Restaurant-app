/**
 * Hostname normalisation.
 *
 * The Host header is attacker-controlled and inconsistently formatted: it may
 * carry a port, arbitrary casing, a legal trailing dot, or an IPv6 literal in
 * brackets. Every one of those must map to the same stored hostname, or a
 * tenant becomes unreachable on a technicality -- or worse, two spellings of
 * one host resolve differently.
 */
export function normalizeHostname(host: string): string {
  let value = host.trim().toLowerCase();

  // IPv6 literal, e.g. "[::1]:3000" -> "[::1]". Must run before port stripping,
  // since the address itself is full of colons.
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    if (close !== -1) return value.slice(0, close + 1);
  }

  const colon = value.lastIndexOf(":");
  if (colon !== -1) value = value.slice(0, colon);

  // "example.com." is the fully-qualified form and equivalent to "example.com".
  if (value.endsWith(".")) value = value.slice(0, -1);

  return value;
}

/**
 * Subdomains the platform reserves for itself. Handing "app" to a restaurant
 * would let their site occupy the admin origin, which is exactly where session
 * cookies live. Rejected at tenant creation.
 */
export const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "cdn",
  "assets",
  "static",
  "mail",
  "smtp",
  "ftp",
  "status",
  "docs",
  "support",
  "help",
  "billing",
  "dashboard",
]);

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug) && !RESERVED_SLUGS.has(slug);
}
