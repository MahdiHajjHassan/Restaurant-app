/**
 * Opening hours evaluation.
 *
 * Three things make this the classic buggy feature, and all three are real for
 * restaurants:
 *
 *   1. The answer depends on the RESTAURANT's timezone, not the server's or the
 *      visitor's. A Beirut kitchen is shut at 3am Beirut time regardless of
 *      where the request came from.
 *   2. Segments cross midnight. "18:00-01:00" is one continuous evening, not an
 *      empty range, and a naive `open <= now < close` reports closed all night.
 *   3. Split shifts mean a day has several segments, so "the day's hours"
 *      cannot be a single row.
 *
 * Comparison happens entirely in local wall-clock terms, derived through
 * Intl.DateTimeFormat with the tenant's zone. That is also what makes it
 * correct across daylight-saving changes: 19:00 local is 19:00 local whether
 * or not the offset shifted that morning.
 */

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export interface HourSegment {
  /** 0 = Sunday .. 6 = Saturday */
  dayOfWeek: number;
  /** "HH:MM" or "HH:MM:SS" */
  opensAt: string;
  closesAt: string;
}

export interface WeekMoment {
  dayOfWeek: number;
  /** Minutes since local midnight. */
  minutes: number;
}

export interface OpenState {
  isOpen: boolean;
  /** When open: when it closes. When closed: when it next opens. Null if never. */
  nextChange: WeekMoment | null;
}

/** "18:30" or "18:30:00" -> 1110 */
export function parseTimeToMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function formatMinutes(minutes: number): string {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = String(Math.floor(normalized / 60)).padStart(2, "0");
  const m = String(normalized % 60).padStart(2, "0");
  return `${h}:${m}`;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zonedFormatters.get(timeZone);
  if (cached) return cached;

  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    // h23 keeps midnight as 00 rather than 24, which would push the moment into
    // the wrong day.
    hourCycle: "h23",
  });
  zonedFormatters.set(timeZone, created);
  return created;
}

/** The local weekday and time-of-day at `instant`, in `timeZone`. */
export function toWeekMoment(instant: Date, timeZone: string): WeekMoment {
  const parts = zonedFormatter(timeZone).formatToParts(instant);
  const lookup = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const dayOfWeek = WEEKDAY_INDEX[lookup("weekday")] ?? 0;
  const minutes = Number(lookup("hour")) * 60 + Number(lookup("minute"));

  return { dayOfWeek, minutes };
}

function toWeekMinutes(moment: WeekMoment): number {
  return moment.dayOfWeek * MINUTES_PER_DAY + moment.minutes;
}

function fromWeekMinutes(weekMinutes: number): WeekMoment {
  const wrapped =
    ((weekMinutes % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  return {
    dayOfWeek: Math.floor(wrapped / MINUTES_PER_DAY),
    minutes: wrapped % MINUTES_PER_DAY,
  };
}

interface Interval {
  start: number;
  /** May exceed one week; the caller wraps. */
  end: number;
}

/**
 * Projects segments onto a linear week.
 *
 * A segment whose close is at or before its open runs past midnight, so a day
 * is added to its end. That single adjustment is what makes 18:00-01:00 behave
 * as one continuous interval instead of an empty one.
 */
function toIntervals(segments: readonly HourSegment[]): Interval[] {
  return segments.map((segment) => {
    const opens = parseTimeToMinutes(segment.opensAt);
    const closes = parseTimeToMinutes(segment.closesAt);
    const start = segment.dayOfWeek * MINUTES_PER_DAY + opens;
    const duration =
      closes > opens ? closes - opens : closes + MINUTES_PER_DAY - opens;
    return { start, end: start + duration };
  });
}

function contains(interval: Interval, weekMinutes: number): boolean {
  if (interval.end <= MINUTES_PER_WEEK) {
    return weekMinutes >= interval.start && weekMinutes < interval.end;
  }
  // Saturday night spilling into Sunday morning wraps around the week boundary.
  return (
    weekMinutes >= interval.start ||
    weekMinutes < interval.end - MINUTES_PER_WEEK
  );
}

/**
 * Evaluates whether the restaurant is open at `instant`.
 *
 * No segments means closed -- an owner who has not configured hours must not
 * have their site claim to be open.
 */
export function getOpenState(
  segments: readonly HourSegment[],
  instant: Date,
  timeZone: string,
): OpenState {
  if (segments.length === 0) return { isOpen: false, nextChange: null };

  const now = toWeekMinutes(toWeekMoment(instant, timeZone));
  const intervals = toIntervals(segments);

  const current = intervals.find((interval) => contains(interval, now));
  if (current) {
    return { isOpen: true, nextChange: fromWeekMinutes(current.end) };
  }

  // Closed: find the soonest upcoming opening, measured forward around the week.
  let bestDelta = Number.POSITIVE_INFINITY;
  let bestStart = 0;
  for (const interval of intervals) {
    const delta =
      (((interval.start - now) % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) %
      MINUTES_PER_WEEK;
    if (delta < bestDelta) {
      bestDelta = delta;
      bestStart = interval.start;
    }
  }

  return { isOpen: false, nextChange: fromWeekMinutes(bestStart) };
}

/** Groups segments by weekday, sorted, for rendering an hours table. */
export function groupByDay(
  segments: readonly HourSegment[],
): Map<number, HourSegment[]> {
  const byDay = new Map<number, HourSegment[]>();
  for (let day = 0; day < 7; day += 1) byDay.set(day, []);

  for (const segment of segments) {
    byDay.get(segment.dayOfWeek)?.push(segment);
  }
  for (const list of byDay.values()) {
    list.sort(
      (a, b) => parseTimeToMinutes(a.opensAt) - parseTimeToMinutes(b.opensAt),
    );
  }
  return byDay;
}
