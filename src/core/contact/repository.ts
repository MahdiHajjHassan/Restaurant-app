import { asc, eq } from "drizzle-orm";
import { contactSettings, openingHours } from "../db/schema";
import type { TenantSession } from "../db/tenant";
import type { HourSegment } from "./hours";

export type ContactSettings = typeof contactSettings.$inferSelect;
export type OpeningHourRow = typeof openingHours.$inferSelect;

export function createContactRepository(session: TenantSession) {
  const { tx, tenantId } = session;

  return {
    async getSettings(): Promise<ContactSettings | null> {
      const rows = await tx
        .select()
        .from(contactSettings)
        .where(eq(contactSettings.tenantId, tenantId))
        .limit(1);
      return rows[0] ?? null;
    },

    async listOpeningHours(): Promise<OpeningHourRow[]> {
      return tx
        .select()
        .from(openingHours)
        .where(eq(openingHours.tenantId, tenantId))
        .orderBy(asc(openingHours.dayOfWeek), asc(openingHours.opensAt));
    },
  };
}

/** Narrows database rows to the shape the hours logic works with. */
export function toHourSegments(rows: readonly OpeningHourRow[]): HourSegment[] {
  return rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
  }));
}

export type ContactRepository = ReturnType<typeof createContactRepository>;
