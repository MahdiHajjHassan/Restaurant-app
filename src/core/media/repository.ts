import { and, eq } from "drizzle-orm";
import { media } from "../db/schema";
import type { TenantSession } from "../db/tenant";

export type Media = typeof media.$inferSelect;

/**
 * Callers never supply `tenantId` -- it comes from the session, for the same
 * reason it does in the menu repository: accepting it as input reintroduces the
 * mistake this layer exists to prevent.
 */
export type NewMedia = Omit<
  typeof media.$inferInsert,
  "tenantId" | "id" | "createdAt" | "updatedAt"
>;

/**
 * Media repository, bound to one tenant.
 *
 * Every statement also filters on tenantId even though RLS enforces it too.
 * The redundancy is deliberate: two independent layers mean a mistake in either
 * one alone cannot leak a restaurant's uploads to another.
 */
export function createMediaRepository(session: TenantSession) {
  const { tx, tenantId } = session;

  return {
    async insert(record: NewMedia): Promise<Media> {
      const rows = await tx
        .insert(media)
        .values({ ...record, tenantId })
        .returning();

      const inserted = rows[0];
      if (!inserted) throw new Error("Media insert returned no row");
      return inserted;
    },

    async findById(id: string): Promise<Media | null> {
      const rows = await tx
        .select()
        .from(media)
        .where(and(eq(media.id, id), eq(media.tenantId, tenantId)))
        .limit(1);

      return rows[0] ?? null;
    },

    async deleteById(id: string): Promise<void> {
      await tx
        .delete(media)
        .where(and(eq(media.id, id), eq(media.tenantId, tenantId)));
    },
  };
}
