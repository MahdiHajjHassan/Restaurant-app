import { and, eq, gt, gte, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { loginAttempts, memberships, sessions, tenants, users } from "../db/schema";
import { hashSessionToken, sessionExpiry } from "./session";

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

/**
 * Authentication data access.
 *
 * Platform-level, so deliberately not tenant-scoped: a user exists before any
 * tenant context does, and a person may belong to several restaurants.
 * Authorization for a specific tenant is a separate step -- see
 * findMembership below, which every admin action must go through.
 */

export async function findUserByEmail(
  db: Database,
  email: string,
): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePasswordHash(
  db: Database,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// ─── Sessions ─────────────────────────────────────────────────────────────

export async function createSession(
  db: Database,
  input: {
    userId: string;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<Session> {
  const [row] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      tokenHash: hashSessionToken(input.token),
      expiresAt: sessionExpiry(),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning();

  if (!row) throw new Error("Insert returned no session row");
  return row;
}

/**
 * Looks up a live session by its raw token.
 *
 * Expiry is filtered in SQL rather than checked afterwards, so a stale row can
 * never be treated as valid because of a missed branch.
 */
export async function findSessionByToken(
  db: Database,
  token: string,
): Promise<{ session: Session; user: User } | null> {
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function extendSession(
  db: Database,
  sessionId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ expiresAt: sessionExpiry() })
    .where(eq(sessions.id, sessionId));
}

export async function deleteSessionByToken(
  db: Database,
  token: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

/** Signs a user out everywhere. Used after a password change. */
export async function deleteSessionsForUser(
  db: Database,
  userId: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteExpiredSessions(db: Database): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

// ─── Login rate limiting ──────────────────────────────────────────────────

export async function recordLoginAttempt(
  db: Database,
  identifier: string,
): Promise<void> {
  await db.insert(loginAttempts).values({ identifier: identifier.toLowerCase() });
}

export async function countRecentLoginAttempts(
  db: Database,
  identifier: string,
  windowMs: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifier, identifier.toLowerCase()),
        gte(loginAttempts.attemptedAt, since),
      ),
    );

  return rows[0]?.count ?? 0;
}

export async function clearLoginAttempts(
  db: Database,
  identifier: string,
): Promise<void> {
  await db
    .delete(loginAttempts)
    .where(eq(loginAttempts.identifier, identifier.toLowerCase()));
}

// ─── Authorization ────────────────────────────────────────────────────────

export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  /** Carried here so admin actions can format money without a second query. */
  currency: string;
  role: "owner" | "staff";
}

const membershipColumns = {
  tenantId: memberships.tenantId,
  tenantName: tenants.name,
  tenantSlug: tenants.slug,
  currency: tenants.currency,
  role: memberships.role,
} as const;

/**
 * Every restaurant this user may administer.
 *
 * This is the query that DECIDES the tenant context, so it necessarily runs
 * before one exists -- which is why `memberships` is deliberately outside RLS
 * (see migration 0003). The protection here is that `userId` comes from the
 * session cookie and never from client input, and that every subsequent write
 * goes through withTenant.
 */
export async function listMembershipsForUser(
  db: Database,
  userId: string,
): Promise<TenantMembership[]> {
  return db
    .select(membershipColumns)
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(eq(memberships.userId, userId))
    .orderBy(tenants.name);
}

/**
 * The authorization check.
 *
 * Returns null when this user has no membership in this tenant. Every admin
 * action must call it before touching tenant data: a signed-in user is not the
 * same as a user entitled to THIS restaurant, and conflating the two is how
 * multi-tenant products leak.
 */
export async function findMembership(
  db: Database,
  userId: string,
  tenantId: string,
): Promise<TenantMembership | null> {
  const rows = await db
    .select(membershipColumns)
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(
      and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)),
    )
    .limit(1);

  return rows[0] ?? null;
}
