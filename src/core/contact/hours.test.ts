import { describe, expect, it } from "vitest";
import {
  formatMinutes,
  getOpenState,
  groupByDay,
  type HourSegment,
  parseTimeToMinutes,
  toWeekMoment,
} from "./hours";

const BEIRUT = "Asia/Beirut";

// January, so Beirut is on standard time (UTC+2). Stated explicitly because
// every instant below is written as UTC and read as local.
const MON_12_00 = new Date("2026-01-05T10:00:00Z"); // Monday 12:00 Beirut
const MON_10_00 = new Date("2026-01-05T08:00:00Z"); // Monday 10:00 Beirut
const MON_16_00 = new Date("2026-01-05T14:00:00Z"); // Monday 16:00 Beirut
const SAT_00_30 = new Date("2026-01-09T22:30:00Z"); // Saturday 00:30 Beirut
const SUN_00_30 = new Date("2026-01-10T22:30:00Z"); // Sunday 00:30 Beirut

const lunch = (day: number): HourSegment => ({
  dayOfWeek: day,
  opensAt: "11:00:00",
  closesAt: "15:00:00",
});
const dinner = (day: number): HourSegment => ({
  dayOfWeek: day,
  opensAt: "18:00:00",
  closesAt: "23:00:00",
});

describe("parseTimeToMinutes", () => {
  it.each([
    ["00:00", 0],
    ["09:30", 570],
    ["18:00:00", 1080],
    ["23:59", 1439],
  ])("parses %j to %i", (input, expected) => {
    expect(parseTimeToMinutes(input)).toBe(expected);
  });
});

describe("toWeekMoment", () => {
  it("reads the weekday and time in the tenant's zone", () => {
    expect(toWeekMoment(MON_12_00, BEIRUT)).toEqual({
      dayOfWeek: 1,
      minutes: 720,
    });
  });

  it("gives a different local day for the same instant in another zone", () => {
    // 22:30 UTC Friday is already Saturday in Beirut but still Friday in NY.
    expect(toWeekMoment(SAT_00_30, BEIRUT).dayOfWeek).toBe(6);
    expect(toWeekMoment(SAT_00_30, "America/New_York").dayOfWeek).toBe(5);
  });

  it("reports midnight as hour 0, not 24", () => {
    // hourCycle h23 matters: "24:00" would land the moment on the wrong day.
    expect(toWeekMoment(SUN_00_30, BEIRUT)).toEqual({
      dayOfWeek: 0,
      minutes: 30,
    });
  });
});

describe("getOpenState", () => {
  it("is closed when no hours are configured", () => {
    // An owner who never set hours must not have their site claim to be open.
    expect(getOpenState([], MON_12_00, BEIRUT)).toEqual({
      isOpen: false,
      nextChange: null,
    });
  });

  it("is open inside a segment and reports the closing time", () => {
    const state = getOpenState([lunch(1)], MON_12_00, BEIRUT);

    expect(state.isOpen).toBe(true);
    expect(state.nextChange).toEqual({ dayOfWeek: 1, minutes: 15 * 60 });
  });

  it("is closed before opening and reports when it opens", () => {
    const state = getOpenState([lunch(1)], MON_10_00, BEIRUT);

    expect(state.isOpen).toBe(false);
    expect(state.nextChange).toEqual({ dayOfWeek: 1, minutes: 11 * 60 });
  });

  it("is closed between split shifts, not open all afternoon", () => {
    const state = getOpenState([lunch(1), dinner(1)], MON_16_00, BEIRUT);

    expect(state.isOpen).toBe(false);
    expect(state.nextChange).toEqual({ dayOfWeek: 1, minutes: 18 * 60 });
  });

  it("stays open after midnight on a segment that crosses it", () => {
    // Friday 18:00-01:00 at Saturday 00:30. A naive open <= now < close
    // comparison reports closed here, which is the single most common bug in
    // an Open now badge.
    const fridayLate: HourSegment = {
      dayOfWeek: 5,
      opensAt: "18:00:00",
      closesAt: "01:00:00",
    };

    expect(getOpenState([fridayLate], SAT_00_30, BEIRUT).isOpen).toBe(true);
  });

  it("closes exactly at 01:00 on a midnight-crossing segment", () => {
    const fridayLate: HourSegment = {
      dayOfWeek: 5,
      opensAt: "18:00:00",
      closesAt: "01:00:00",
    };

    // Both sides of the boundary, so the interval cannot be off by an hour or
    // silently run until morning.
    const justBeforeClose = new Date("2026-01-09T22:59:00Z"); // Sat 00:59 Beirut
    const justAfterClose = new Date("2026-01-09T23:01:00Z"); // Sat 01:01 Beirut

    expect(getOpenState([fridayLate], justBeforeClose, BEIRUT).isOpen).toBe(
      true,
    );
    expect(getOpenState([fridayLate], justAfterClose, BEIRUT).isOpen).toBe(
      false,
    );
  });

  it("wraps Saturday night into Sunday morning across the week boundary", () => {
    // The interval runs past the end of the week array and must not be lost.
    const saturdayLate: HourSegment = {
      dayOfWeek: 6,
      opensAt: "12:00:00",
      closesAt: "01:00:00",
    };

    expect(getOpenState([saturdayLate], SUN_00_30, BEIRUT).isOpen).toBe(true);
  });

  it("answers per the tenant's timezone, not the server's", () => {
    // Same instant, same hours, different restaurant location.
    const hours = [lunch(1)];

    expect(getOpenState(hours, MON_12_00, BEIRUT).isOpen).toBe(true);
    // 10:00 UTC is 05:00 in New York -- shut.
    expect(getOpenState(hours, MON_12_00, "America/New_York").isOpen).toBe(
      false,
    );
  });

  it("finds next week's opening when nothing remains this week", () => {
    // Closed Monday 16:00 with only Monday lunch configured: the next opening
    // is the same slot seven days later, not "never".
    const state = getOpenState([lunch(1)], MON_16_00, BEIRUT);

    expect(state.isOpen).toBe(false);
    expect(state.nextChange).toEqual({ dayOfWeek: 1, minutes: 11 * 60 });
  });
});

describe("groupByDay", () => {
  it("returns all seven days, empty ones included", () => {
    expect(groupByDay([lunch(1)]).size).toBe(7);
    expect(groupByDay([lunch(1)]).get(3)).toEqual([]);
  });

  it("sorts a day's segments by opening time", () => {
    const day = groupByDay([dinner(2), lunch(2)]).get(2);
    expect(day?.map((s) => s.opensAt)).toEqual(["11:00:00", "18:00:00"]);
  });
});

describe("formatMinutes", () => {
  it.each([
    [0, "00:00"],
    [570, "09:30"],
    [1080, "18:00"],
    [1439, "23:59"],
  ])("formats %i as %j", (input, expected) => {
    expect(formatMinutes(input)).toBe(expected);
  });
});
