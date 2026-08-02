"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createContactRepository } from "@/core/contact/repository";
import { withTenant } from "@/core/db/tenant";
import { requireMembership } from "@/server/auth";
import { db } from "@/server/db";

export interface HoursFormState {
  error: string | null;
  saved?: boolean;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The editor offers two segments per day, which covers a split shift. */
const SEGMENTS_PER_DAY = 2;

export async function updateHours(
  tenantId: string,
  _previous: HoursFormState,
  formData: FormData,
): Promise<HoursFormState> {
  const { membership } = await requireMembership(
    z.string().uuid().parse(tenantId),
  );

  const segments: { dayOfWeek: number; opensAt: string; closesAt: string }[] =
    [];

  for (let day = 0; day < 7; day += 1) {
    for (let slot = 0; slot < SEGMENTS_PER_DAY; slot += 1) {
      const opensAt = String(formData.get(`d${day}s${slot}open`) ?? "").trim();
      const closesAt = String(formData.get(`d${day}s${slot}close`) ?? "").trim();

      // Both blank means this slot is unused. A day with no segments is closed.
      if (!opensAt && !closesAt) continue;

      if (!TIME.test(opensAt) || !TIME.test(closesAt)) {
        return {
          error: `Fill in both an opening and a closing time, or leave both empty.`,
        };
      }

      // Equal times are rejected rather than silently stored: closesAt <=
      // opensAt means "crosses midnight", so 11:00-11:00 would be read as open
      // for a full 24 hours, which is never what an owner meant.
      if (opensAt === closesAt) {
        return { error: "Opening and closing times cannot be the same." };
      }

      segments.push({ dayOfWeek: day, opensAt, closesAt });
    }
  }

  await withTenant(db, membership.tenantId, async (session) => {
    await createContactRepository(session).replaceOpeningHours(segments);
  });

  revalidatePath(`/${membership.tenantId}/hours`);
  return { error: null, saved: true };
}
