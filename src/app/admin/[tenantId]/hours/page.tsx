import { createContactRepository } from "@/core/contact/repository";
import { withTenant } from "@/core/db/tenant";
import { getMessages } from "@/core/i18n/messages";
import { requireMembership } from "@/server/auth";
import { db } from "@/server/db";
import { PageHeader } from "@/ui/console";
import { HoursForm, type DaySlots } from "./hours-form";

export default async function HoursPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const { membership } = await requireMembership(tenantId);

  const rows = await withTenant(db, membership.tenantId, async (session) =>
    createContactRepository(session).listOpeningHours(),
  );

  // Two slots per day, filled in order. The time input wants HH:MM, while
  // Postgres returns HH:MM:SS.
  const initial: DaySlots[] = Array.from({ length: 7 }, () => ({ slots: [] }));
  for (const row of rows) {
    initial[row.dayOfWeek]?.slots.push({
      open: row.opensAt.slice(0, 5),
      close: row.closesAt.slice(0, 5),
    });
  }

  return (
    <main>
      <PageHeader
        title="Opening hours"
        description="Leave a day empty to show it as closed. A shift that runs past midnight is fine — set the closing time to the next morning."
      />
      <HoursForm
        tenantId={tenantId}
        days={getMessages("en").days}
        initial={initial}
      />
    </main>
  );
}
