import { createHash, randomBytes } from "node:crypto";

/**
 * Session tokens.
 *
 * The token goes to the browser; only its SHA-256 hash is stored. A database
 * leak therefore yields nothing that can be presented as a valid session --
 * the same reasoning as password hashing, and equally cheap to do up front.
 *
 * No key-stretching here, unlike passwords: the token is 256 bits of CSPRNG
 * output, so there is no low-entropy secret to protect against brute force.
 */

const TOKEN_BYTES = 32;

/** 30 days. Long enough that a restaurant owner is not re-typing a password weekly. */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Sessions past this age are extended on use, so an active owner stays signed
 * in while an abandoned session still expires.
 */
export const SESSION_REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = "rp_session";

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_DURATION_MS);
}

export function shouldRefresh(
  expiresAt: Date,
  now: Date = new Date(),
): boolean {
  const remaining = expiresAt.getTime() - now.getTime();
  return remaining < SESSION_DURATION_MS - SESSION_REFRESH_AFTER_MS;
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
