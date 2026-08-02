"use client";

import { useEffect, useState } from "react";
import {
  formatMinutes,
  getOpenState,
  type HourSegment,
} from "@/core/contact/hours";
import { interpolate } from "@/core/i18n/messages";

interface OpenBadgeLabels {
  openNow: string;
  closed: string;
  /** Template with {time} */
  closesAt: string;
  /** Template with {day} and {time} */
  opensAt: string;
  hoursUnset: string;
}

interface OpenBadgeProps {
  segments: readonly HourSegment[];
  timeZone: string;
  labels: OpenBadgeLabels;
  days: readonly string[];
}

interface Status {
  isOpen: boolean;
  /** "Open now" / "Closed" / "Hours not listed" */
  primary: string;
  /** "Closes 23:00" / "Opens Monday 11:00", or null when there is nothing to add. */
  detail: string | null;
}

function describe(
  segments: readonly HourSegment[],
  timeZone: string,
  labels: OpenBadgeLabels,
  days: readonly string[],
  now: Date,
): Status {
  if (segments.length === 0) {
    return { isOpen: false, primary: labels.hoursUnset, detail: null };
  }

  const state = getOpenState(segments, now, timeZone);
  const primary = state.isOpen ? labels.openNow : labels.closed;

  if (!state.nextChange) {
    return { isOpen: state.isOpen, primary, detail: null };
  }

  const time = formatMinutes(state.nextChange.minutes);
  const detail = state.isOpen
    ? interpolate(labels.closesAt, { time })
    : interpolate(labels.opensAt, {
        day: days[state.nextChange.dayOfWeek] ?? "",
        time,
      });

  return { isOpen: state.isOpen, primary, detail };
}

/**
 * Live open/closed status.
 *
 * A client component on purpose. Tenant pages are cached hard to meet the
 * mobile performance budget, so a purely server-rendered badge would eventually
 * tell customers a closed restaurant is open -- worse than showing nothing. It
 * renders the server's answer first (real HTML, no layout shift, works without
 * JS), then recomputes on mount and every minute, always in the RESTAURANT's
 * timezone rather than the visitor's.
 */
export function OpenBadge({
  segments,
  timeZone,
  labels,
  days,
}: OpenBadgeProps) {
  const [status, setStatus] = useState<Status>(() =>
    describe(segments, timeZone, labels, days, new Date()),
  );

  useEffect(() => {
    const update = () =>
      setStatus(describe(segments, timeZone, labels, days, new Date()));

    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [segments, timeZone, labels, days]);

  return (
    <p
      data-open={status.isOpen}
      className="flex items-center gap-1.5 text-[0.8rem] text-[var(--color-muted)]"
    >
      <span
        aria-hidden="true"
        className={`inline-block size-1.5 rounded-full ${
          status.isOpen
            ? "bg-[var(--color-accent)]"
            : "bg-[var(--color-muted)] opacity-50"
        }`}
      />
      <span className="font-medium text-[var(--color-ink)]">
        {status.primary}
      </span>
      {status.detail ? <span>· {status.detail}</span> : null}
    </p>
  );
}
