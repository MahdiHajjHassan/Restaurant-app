import type { ContactSettings } from "@/core/contact/repository";
import {
  formatMinutes,
  groupByDay,
  parseTimeToMinutes,
  type HourSegment,
} from "@/core/contact/hours";
import { localizedOptional, type Locale } from "@/core/i18n/locale";
import { getMessages } from "@/core/i18n/messages";

interface ContactSectionProps {
  contact: ContactSettings | null;
  hours: readonly HourSegment[];
  locale: Locale;
}

function mapsHref(contact: ContactSettings, address: string | null): string {
  const query =
    contact.latitude && contact.longitude
      ? `${contact.latitude},${contact.longitude}`
      : (address ?? "");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Everything a customer looks for after the menu: where you are, when you are
 * open, and how to reach you. Deliberately the only non-menu section -- each
 * extra one is something an owner has to fill in, and empty sections make a
 * site look abandoned.
 */
export function ContactSection({
  contact,
  hours,
  locale,
}: ContactSectionProps) {
  const messages = getMessages(locale);
  const address = contact
    ? localizedOptional(contact.addressEn, contact.addressAr, locale)
    : null;

  if (!contact && hours.length === 0) return null;

  const byDay = groupByDay(hours);

  return (
    <section
      id="find-us"
      className="mt-14 border-t border-[var(--color-rule)] pt-10"
    >
      <h2 className="font-display text-xl">{messages.findUs}</h2>

      <div className="mt-5 grid gap-8 sm:grid-cols-2">
        {hours.length > 0 ? (
          <div>
            <h3 className="text-[0.7rem] tracking-[0.12em] text-[var(--color-muted)] uppercase">
              {messages.hours}
            </h3>
            <dl className="mt-3 space-y-1 text-[0.85rem]">
              {messages.days.map((dayName, index) => {
                const segments = byDay.get(index) ?? [];
                return (
                  <div key={dayName} className="flex items-baseline gap-2">
                    <dt className="text-[var(--color-muted)]">{dayName}</dt>
                    <span className="leader" aria-hidden="true" />
                    {/*
                      Forced LTR. Times are left-to-right runs, and inside RTL
                      text the bidi algorithm reorders them: "11:00–15:00,
                      18:00–23:00" renders as "23:00–18:00 ,15:00–11:00", which
                      an Arabic reader parses as closing before opening.
                    */}
                    <dd className="price" dir="ltr">
                      {segments.length === 0
                        ? messages.closed
                        : segments
                            .map(
                              (segment) =>
                                `${formatMinutes(parseTimeToMinutes(segment.opensAt))}–${formatMinutes(parseTimeToMinutes(segment.closesAt))}`,
                            )
                            .join(", ")}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ) : null}

        {contact ? (
          <div>
            {address ? (
              <>
                <h3 className="text-[0.7rem] tracking-[0.12em] text-[var(--color-muted)] uppercase">
                  {messages.directions}
                </h3>
                <p className="mt-3 text-[0.85rem] leading-relaxed">{address}</p>
              </>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {address || (contact.latitude && contact.longitude) ? (
                <a
                  href={mapsHref(contact, address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[var(--color-rule)] px-3 py-1.5 text-[0.8rem] transition-colors hover:border-[var(--color-accent)]"
                >
                  {messages.directions}
                </a>
              ) : null}

              {/* Tap-to-call is the single most-used control on a restaurant
                  site viewed on a phone. */}
              {contact.phone ? (
                <a
                  href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                  className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-[0.8rem] text-[var(--color-on-accent)]"
                >
                  {messages.call}
                </a>
              ) : null}

              {contact.whatsapp ? (
                <a
                  href={`https://wa.me/${contact.whatsapp.replace(/[^\d]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[var(--color-rule)] px-3 py-1.5 text-[0.8rem] transition-colors hover:border-[var(--color-accent)]"
                >
                  {messages.whatsapp}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
