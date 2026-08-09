import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  clearLoginAttempts,
  countRecentLoginAttempts,
  createSession,
  deleteSessionByToken,
  extendSession,
  findMembership,
  findSessionByToken,
  findUserByEmail,
  listMembershipsForUser,
  recordLoginAttempt,
  updatePasswordHash,
  type TenantMembership,
  type User,
} from "@/core/auth/repository";
import {
  IMPERSONATION_COOKIE,
  mayAdminister,
} from "@/core/auth/impersonation";
import { hashPassword, needsRehash, verifyPassword } from "@/core/auth/password";
import { findRestaurant } from "@/core/platform/repository";
import {
  generateSessionToken,
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  shouldRefresh,
} from "@/core/auth/session";
import { env } from "@/env";
import { db } from "./db";

/** 8 failures per email in 15 minutes. Generous for a typo, useless for a script. */
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export interface CurrentSession {
  user: User;
  memberships: TenantMembership[];
}

/**
 * The signed-in user, or null.
 *
 * Memoised per request: the admin layout, the page, and any action can each ask
 * without repeating the query.
 */
export const getCurrentSession = cache(
  async (): Promise<CurrentSession | null> => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const found = await findSessionByToken(db, token);
    if (!found) return null;

    // Rolling expiry: an owner who uses the admin weekly stays signed in, an
    // abandoned session still lapses.
    if (shouldRefresh(found.session.expiresAt)) {
      await extendSession(db, found.session.id);
    }

    return {
      user: found.user,
      memberships: await listMembershipsForUser(db, found.user.id),
    };
  },
);

export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * The tenant this session is currently acting as, or null.
 *
 * The cookie is client-controlled and carries no authority of its own -- it
 * only names WHICH restaurant. Whether the holder may enter one at all is
 * decided by `users.is_platform_admin`, read from the session on the server.
 * See core/auth/impersonation.ts.
 */
export async function getImpersonatedTenantId(): Promise<string | null> {
  return (await cookies()).get(IMPERSONATION_COOKIE)?.value ?? null;
}

/**
 * The operator console guard.
 *
 * Redirects rather than 403s, for the same reason requireMembership does:
 * telling a stranger that an operator console exists here is itself a small
 * leak.
 */
export async function requirePlatformAdmin(): Promise<CurrentSession> {
  const session = await requireSession();
  if (!session.user.isPlatformAdmin) redirect("/");
  return session;
}

/**
 * Authorization for one restaurant.
 *
 * Being signed in is NOT the same as being entitled to this tenant, and
 * conflating the two is exactly how multi-tenant products leak. Every admin
 * action that touches tenant data goes through here first.
 *
 * A platform operator may also be here, having deliberately chosen to act as
 * this restaurant. Being a platform admin is NOT by itself access: without
 * that choice they get exactly what any other signed-in stranger gets. The
 * rule itself lives in core/auth/impersonation.ts, where it is enumerated as
 * a truth table.
 */
export async function requireMembership(tenantId: string): Promise<{
  user: User;
  membership: TenantMembership;
  /** True when the caller is an operator acting as this restaurant. */
  impersonating: boolean;
}> {
  const session = await requireSession();

  // Sequential, not Promise.all: both are cheap, and one of them is a cookie
  // read behind an async API rather than real concurrent work.
  const membership = await findMembership(db, session.user.id, tenantId);
  const impersonatingTenantId = await getImpersonatedTenantId();

  const allowed = mayAdminister({
    hasMembership: membership !== null,
    isPlatformAdmin: session.user.isPlatformAdmin,
    impersonatingTenantId,
    tenantId,
  });

  // 404 rather than 403: telling an outsider that a tenant id exists is itself
  // a small leak.
  if (!allowed) redirect("/");

  if (membership) {
    return { user: session.user, membership, impersonating: false };
  }

  /*
   * An impersonating operator has no membership row, so one is synthesised
   * from the tenant itself. It must carry the REAL name and currency: a
   * placeholder currency would render a client's prices wrong by orders of
   * magnitude, which is exactly what the money rules exist to prevent.
   */
  const restaurant = await findRestaurant(db, tenantId);
  if (!restaurant) redirect("/");

  return {
    user: session.user,
    membership: {
      tenantId: restaurant.id,
      tenantName: restaurant.name,
      tenantSlug: restaurant.slug,
      currency: restaurant.currency,
      role: "owner",
    },
    impersonating: true,
  };
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "rate-limited" };

/**
 * Verifies credentials and starts a session.
 *
 * Returns the same "invalid" result for an unknown email and a wrong password,
 * so the response cannot be used to enumerate which emails have accounts.
 */
export async function attemptLogin(
  email: string,
  password: string,
): Promise<LoginResult> {
  const identifier = email.trim().toLowerCase();

  const attempts = await countRecentLoginAttempts(
    db,
    identifier,
    ATTEMPT_WINDOW_MS,
  );
  if (attempts >= MAX_ATTEMPTS) return { ok: false, reason: "rate-limited" };

  const user = await findUserByEmail(db, identifier);
  if (!user) {
    await recordLoginAttempt(db, identifier);
    return { ok: false, reason: "invalid" };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordLoginAttempt(db, identifier);
    return { ok: false, reason: "invalid" };
  }

  // Upgrade the stored hash while the plaintext is in hand, if the cost
  // parameters have been raised since it was written.
  if (needsRehash(user.passwordHash)) {
    await updatePasswordHash(db, user.id, await hashPassword(password));
  }

  await clearLoginAttempts(db, identifier);

  const requestHeaders = await headers();
  const token = generateSessionToken();
  await createSession(db, {
    userId: user.id,
    token,
    ipAddress: requestHeaders.get("x-forwarded-for"),
    userAgent: requestHeaders.get("user-agent"),
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Not readable by script, not sent cross-site, and TLS-only in production.
    // sameSite=lax plus the framework's own origin check on Server Actions is
    // the CSRF defence.
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });

  return { ok: true };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  // Delete the row, not just the cookie: otherwise a copied token stays valid
  // for its full 30 days after the owner thinks they signed out.
  if (token) await deleteSessionByToken(db, token);
  jar.delete(SESSION_COOKIE);
}
