import { sql } from "drizzle-orm";
import type { Database } from "./client";

/** The transaction handle Drizzle hands to `db.transaction(...)`. */
export type TenantTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidTenantIdError extends Error {
  constructor(value: string) {
    super(`Not a valid tenant id: ${JSON.stringify(value)}`);
    this.name = "InvalidTenantIdError";
  }
}

/**
 * Proof that a tenant context is active.
 *
 * Repositories take one of these rather than a bare database handle, and the
 * only way to obtain one is `withTenant`. That makes "forgot to scope the
 * query" a type error instead of a data leak -- the isolation guarantee stops
 * depending on anyone remembering it.
 */
export interface TenantSession {
  readonly tenantId: string;
  readonly tx: TenantTransaction;
}

/**
 * Runs `fn` inside a transaction with the RLS tenant context set.
 *
 * `set_config(..., true)` is the function form of SET LOCAL, so the setting is
 * scoped to this transaction and released with it -- pooled connections cannot
 * leak one request's tenant into the next. It is used instead of a literal
 * `SET LOCAL` because SET does not accept bind parameters, which would force
 * string interpolation into SQL; here the id travels as a parameter.
 *
 * The id is validated anyway: it reaches this function from a Host header.
 */
export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (session: TenantSession) => Promise<T>,
): Promise<T> {
  if (!UUID.test(tenantId)) throw new InvalidTenantIdError(tenantId);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn({ tenantId, tx });
  });
}
