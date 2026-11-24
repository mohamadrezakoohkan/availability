import { describe, expect, it } from "vitest";
import {
  type Exception,
  free,
  type ManualSlot,
  type Publisher,
  type WeeklyRule,
  type Window,
} from "../../src/availability/free";

const [SUN, MON, TUE, THU, FRI, SAT] = [0, 1, 2, 4, 5, 6] as const;

/** `2027-01-11T08:00Z` as an instant. */
function at(iso: string): number {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant) || !iso.endsWith("Z")) throw new Error(`Not a UTC instant: ${iso}`);
  return instant;
}

function rule(
  weekday: number,
  startLocal: string,
  endLocal: string,
  validFrom: string | null = null,
  validUntil: string | null = null,
): WeeklyRule {
  return { weekday, startLocal, endLocal, validFrom, validUntil };
}

function slot(startUtc: string, endUtc: string): ManualSlot {
  return { startUtc: at(startUtc), endUtc: at(endUtc) };
}

function block(startUtc: string, endUtc: string): Exception {
  return { kind: "block", startUtc: at(startUtc), endUtc: at(endUtc) };
}

/** A window as `start/end`, so a failing case prints readable instants. */
function show(window: Window): string {
  const iso = (instant: number) => new Date(instant).toISOString().replace(":00.000Z", "Z");
  return `${iso(window.start)}/${iso(window.end)}`;
}

interface Case {
  name: string;
  /** Overrides for a publisher in Europe/Madrid, 4-week horizon, 15-minute precision, no rows. */
  publisher: Partial<Publisher>;
  from: string;
  to: string;
  /** Defaults to `from`. */
  now?: string;
  /** Windows as `start/end`. */
  expected: string[];
}

function run(testCase: Case): string[] {
  const publisher: Publisher = {
    timeZone: "Europe/Madrid",
    horizonWeeks: 4,
    precisionMinutes: 15,
    weeklyRules: [],
    manualSlots: [],
    exceptions: [],
    ...testCase.publisher,
  };
  const now = at(testCase.now ?? testCase.from);
  return free(publisher, at(testCase.from), at(testCase.to), now).map(show);
}

function table(title: string, cases: Case[]): void {
  describe(title, () => {
    it.each(cases)("$name", (testCase) => {
      expect(run(testCase)).toEqual(testCase.expected);
    });
  });
}

// 2027-01-11 is a Monday. Europe/Madrid is UTC+1 in January.
const WEEK = { from: "2027-01-11T00:00Z", to: "2027-01-18T00:00Z" };

table("rules, slots and blocks", [
  {
    name: "nothing set gives no windows",
    publisher: {},
    ...WEEK,
    expected: [],
  },
  {
    name: "a weekly rule applies on its weekday, in the publisher's zone",
    publisher: { weeklyRules: [rule(MON, "09:00", "12:00")] },
    ...WEEK,
    expected: ["2027-01-11T08:00Z/2027-01-11T11:00Z"],
  },
  {
    name: "weekday 0 is Sunday",
    publisher: { weeklyRules: [rule(SUN, "09:00", "10:00")] },
    ...WEEK,
    expected: ["2027-01-17T08:00Z/2027-01-17T09:00Z"],
  },
  {
    name: "a weekly rule repeats every week",
    publisher: { weeklyRules: [rule(MON, "09:00", "10:00")] },
    from: "2027-01-11T00:00Z",
    to: "2027-02-01T00:00Z",
    expected: [
      "2027-01-11T08:00Z/2027-01-11T09:00Z",
      "2027-01-18T08:00Z/2027-01-18T09:00Z",
      "2027-01-25T08:00Z/2027-01-25T09:00Z",
    ],
  },
  {
    name: "a rule's first and last dates are both inclusive",
    publisher: { weeklyRules: [rule(MON, "09:00", "10:00", "2027-01-18", "2027-01-25")] },
    from: "2027-01-11T00:00Z",
    to: "2027-02-08T00:00Z",
    expected: ["2027-01-18T08:00Z/2027-01-18T09:00Z", "2027-01-25T08:00Z/2027-01-25T09:00Z"],
  },
  {
    name: "a manual slot is one window",
    publisher: { manualSlots: [slot("2027-01-11T10:30Z", "2027-01-11T13:00Z")] },
    ...WEEK,
    expected: ["2027-01-11T10:30Z/2027-01-11T13:00Z"],
  },
  {
    name: "an overlapping rule and slot merge",
    publisher: {
      weeklyRules: [rule(MON, "09:00", "12:00")],
      manualSlots: [slot("2027-01-11T10:30Z", "2027-01-11T13:00Z")],
    },
    ...WEEK,
    expected: ["2027-01-11T08:00Z/2027-01-11T13:00Z"],
  },
  {
    name: "touching windows merge",
    publisher: { weeklyRules: [rule(MON, "09:00", "12:00"), rule(MON, "12:00", "14:00")] },
    ...WEEK,
    expected: ["2027-01-11T08:00Z/2027-01-11T13:00Z"],
  },
  {
    name: "a block splits a window",
    publisher: {
      weeklyRules: [rule(MON, "09:00", "17:00")],
      exceptions: [block("2027-01-11T11:00Z", "2027-01-11T12:00Z")],
    },
    ...WEEK,
    expected: ["2027-01-11T08:00Z/2027-01-11T11:00Z", "2027-01-11T12:00Z/2027-01-11T16:00Z"],
  },
  {
    name: "overlapping blocks are removed as one",
    publisher: {
      weeklyRules: [rule(MON, "09:00", "17:00")],
      exceptions: [
        block("2027-01-11T11:00Z", "2027-01-11T12:00Z"),
        block("2027-01-11T07:00Z", "2027-01-11T08:30Z"),
        block("2027-01-11T10:00Z", "2027-01-11T11:30Z"),
      ],
    },
    ...WEEK,
    expected: ["2027-01-11T08:30Z/2027-01-11T10:00Z", "2027-01-11T12:00Z/2027-01-11T16:00Z"],
  },
  {
    name: "a block wins over a manual slot",
    publisher: {
      manualSlots: [slot("2027-01-11T10:00Z", "2027-01-11T12:00Z")],
      exceptions: [block("2027-01-11T09:00Z", "2027-01-11T13:00Z")],
    },
    ...WEEK,
    expected: [],
  },
  {
    name: "a block wins where a rule and a slot overlap",
    publisher: {
      weeklyRules: [rule(MON, "09:00", "12:00")],
      manualSlots: [slot("2027-01-11T10:30Z", "2027-01-11T13:00Z")],
      exceptions: [block("2027-01-11T10:00Z", "2027-01-11T12:00Z")],
    },
    ...WEEK,
    expected: ["2027-01-11T08:00Z/2027-01-11T10:00Z", "2027-01-11T12:00Z/2027-01-11T13:00Z"],
  },
  {
    name: "blocks that only touch a window leave it whole",
    publisher: {
      weeklyRules: [rule(MON, "09:00", "12:00")],
      exceptions: [
        block("2027-01-11T07:00Z", "2027-01-11T08:00Z"),
        block("2027-01-11T11:00Z", "2027-01-11T12:00Z"),
      ],
    },
    ...WEEK,
    expected: ["2027-01-11T08:00Z/2027-01-11T11:00Z"],
  },
  {
    name: "a rule that crosses midnight is one window",
    publisher: { weeklyRules: [rule(FRI, "22:00", "02:00")] },
    ...WEEK,
    expected: ["2027-01-15T21:00Z/2027-01-16T01:00Z"],
  },
  {
    name: "a rule that crosses midnight is found when the range starts after midnight",
    publisher: { weeklyRules: [rule(FRI, "22:00", "02:00")] },
    from: "2027-01-16T00:00Z",
    to: "2027-01-17T00:00Z",
    expected: ["2027-01-16T00:00Z/2027-01-16T01:00Z"],
  },
  {
    name: "a block can cut a rule that crosses midnight",
    publisher: {
      weeklyRules: [rule(FRI, "22:00", "02:00")],
      exceptions: [block("2027-01-15T22:30Z", "2027-01-15T23:30Z")],
    },
    ...WEEK,
    expected: ["2027-01-15T21:00Z/2027-01-15T22:30Z", "2027-01-15T23:30Z/2027-01-16T01:00Z"],
  },
  {
    name: "a rule that ends when it starts lasts 24 hours",
    publisher: { weeklyRules: [rule(MON, "00:00", "00:00"), rule(TUE, "00:00", "00:00")] },
    from: "2027-01-10T00:00Z",
    to: "2027-01-14T00:00Z",
    expected: ["2027-01-10T23:00Z/2027-01-12T23:00Z"],
  },
  {
    name: "the output is sorted whatever the input order",
    publisher: {
      manualSlots: [
        slot("2027-01-13T10:00Z", "2027-01-13T11:00Z"),
        slot("2027-01-11T10:00Z", "2027-01-11T11:00Z"),
        slot("2027-01-12T10:00Z", "2027-01-12T11:00Z"),
      ],
    },
    ...WEEK,
    expected: [
      "2027-01-11T10:00Z/2027-01-11T11:00Z",
      "2027-01-12T10:00Z/2027-01-12T11:00Z",
      "2027-01-13T10:00Z/2027-01-13T11:00Z",
    ],
  },
  {
    name: "empty and reversed slots and blocks are ignored",
    publisher: {
      manualSlots: [
        slot("2027-01-11T10:00Z", "2027-01-11T11:00Z"),
        slot("2027-01-12T10:00Z", "2027-01-12T10:00Z"),
        slot("2027-01-13T11:00Z", "2027-01-13T10:00Z"),
      ],
      exceptions: [block("2027-01-11T12:00Z", "2027-01-11T09:00Z")],
    },
    ...WEEK,
    expected: ["2027-01-11T10:00Z/2027-01-11T11:00Z"],
  },
]);

table("rounding inward", [
  {
    name: "09:10–11:50 at 30 minutes becomes 09:30–11:30 (SPEC.md §3.3)",
    publisher: {
      precisionMinutes: 30,
      manualSlots: [slot("2027-01-11T08:10Z", "2027-01-11T10:50Z")],
    },
    ...WEEK,
    expected: ["2027-01-11T08:30Z/2027-01-11T10:30Z"],
  },
  {
    name: "at 60 minutes",
    publisher: {
      precisionMinutes: 60,
      manualSlots: [slot("2027-01-11T08:10Z", "2027-01-11T10:50Z")],
    },
    ...WEEK,
    expected: ["2027-01-11T09:00Z/2027-01-11T10:00Z"],
  },
  {
    name: "at 15 minutes",
    publisher: {
      precisionMinutes: 15,
      manualSlots: [slot("2027-01-11T08:10Z", "2027-01-11T10:50Z")],
    },
    ...WEEK,
    expected: ["2027-01-11T08:15Z/2027-01-11T10:45Z"],
  },
  {
    name: "edges already on the grid do not move",
    publisher: {
      precisionMinutes: 60,
      manualSlots: [slot("2027-01-11T08:00Z", "2027-01-11T10:00Z")],
    },
    ...WEEK,
    expected: ["2027-01-11T08:00Z/2027-01-11T10:00Z"],
  },
  {
    name: "a window that rounds to nothing is dropped",
    publisher: {
      precisionMinutes: 30,
      manualSlots: [slot("2027-01-11T08:10Z", "2027-01-11T08:25Z")],
    },
    ...WEEK,
    expected: [],
  },
  {
    name: "rounding happens after merging, not before",
    publisher: {
      precisionMinutes: 30,
      manualSlots: [
        slot("2027-01-11T08:10Z", "2027-01-11T09:10Z"),
        slot("2027-01-11T09:10Z", "2027-01-11T10:50Z"),
      ],
    },
    ...WEEK,
    expected: ["2027-01-11T08:30Z/2027-01-11T10:30Z"],
  },
  {
    name: "a quick block that starts now removes the rest of the current slot",
    publisher: {
      precisionMinutes: 30,
      weeklyRules: [rule(MON, "09:00", "17:00")],
      exceptions: [block("2027-01-11T08:10Z", "2027-01-11T10:10Z")],
    },
    from: "2027-01-11T08:10Z",
    to: "2027-01-12T00:00Z",
    expected: ["2027-01-11T10:30Z/2027-01-11T16:00Z"],
  },
  {
    name: "the grid is the publisher's local clock: UTC+5:30 at 60 minutes",
    publisher: {
      timeZone: "Asia/Kolkata",
      precisionMinutes: 60,
      // 09:10–11:50 local
      manualSlots: [slot("2027-01-11T03:40Z", "2027-01-11T06:20Z")],
    },
    ...WEEK,
    // 10:00–11:00 local
    expected: ["2027-01-11T04:30Z/2027-01-11T05:30Z"],
  },
  {
    name: "the grid is the publisher's local clock: UTC+5:45 at 30 minutes",
    publisher: {
      timeZone: "Asia/Kathmandu",
      precisionMinutes: 30,
      // 09:10–11:50 local
      manualSlots: [slot("2027-01-11T03:25Z", "2027-01-11T06:05Z")],
    },
    ...WEEK,
    // 09:30–11:30 local
    expected: ["2027-01-11T03:45Z/2027-01-11T05:45Z"],
  },
]);

table("clipping to the request, the present and the horizon", [
  {
    name: "a window in progress starts now",
    publisher: { weeklyRules: [rule(MON, "09:00", "12:00")] },
    ...WEEK,
    now: "2027-01-11T09:10Z",
    expected: ["2027-01-11T09:10Z/2027-01-11T11:00Z"],
  },
  {
    name: "windows are cut to the requested range",
    publisher: { weeklyRules: [rule(MON, "09:00", "12:00")] },
    from: "2027-01-11T09:00Z",
    to: "2027-01-11T10:00Z",
    now: "2027-01-11T00:00Z",
    expected: ["2027-01-11T09:00Z/2027-01-11T10:00Z"],
  },
  {
    name: "nothing is returned beyond the horizon, and a window across it is cut",
    publisher: { horizonWeeks: 1, weeklyRules: [rule(MON, "09:00", "12:00")] },
    from: "2027-01-01T00:00Z",
    to: "2027-03-01T00:00Z",
    now: "2027-01-11T08:30Z",
    expected: ["2027-01-11T08:30Z/2027-01-11T11:00Z", "2027-01-18T08:00Z/2027-01-18T08:30Z"],
  },
  {
    name: "a range in the past is empty",
    publisher: { weeklyRules: [rule(MON, "09:00", "12:00")] },
    from: "2027-01-04T00:00Z",
    to: "2027-01-10T00:00Z",
    now: "2027-01-11T00:00Z",
    expected: [],
  },
  {
    name: "a range beyond the horizon is empty",
    publisher: { horizonWeeks: 1, weeklyRules: [rule(MON, "09:00", "12:00")] },
    from: "2027-02-01T00:00Z",
    to: "2027-02-08T00:00Z",
    now: "2027-01-11T00:00Z",
    expected: [],
  },
  {
    name: "a range that ends before it starts is empty",
    publisher: { weeklyRules: [rule(MON, "09:00", "12:00")] },
    from: "2027-01-12T00:00Z",
    to: "2027-01-11T00:00Z",
    now: "2027-01-11T00:00Z",
    expected: [],
  },
]);

// Clocks go from 02:00 to 03:00 on Sunday 2027-03-28, at 01:00Z.
const MADRID_SPRING = { from: "2027-03-27T00:00Z", to: "2027-03-30T00:00Z" };
// Clocks go from 03:00 back to 02:00 on Sunday 2027-10-31, at 01:00Z.
const MADRID_AUTUMN = { from: "2027-10-30T00:00Z", to: "2027-11-02T00:00Z" };

table("daylight saving in Europe/Madrid", [
  {
    name: "spring: a rule across the missing hour is an hour shorter",
    publisher: { weeklyRules: [rule(SUN, "01:00", "04:00")] },
    ...MADRID_SPRING,
    expected: ["2027-03-28T00:00Z/2027-03-28T02:00Z"],
  },
  {
    name: "spring: a start that does not exist moves to the first valid minute after it",
    publisher: { weeklyRules: [rule(SUN, "02:30", "04:00")] },
    ...MADRID_SPRING,
    expected: ["2027-03-28T01:00Z/2027-03-28T02:00Z"],
  },
  {
    name: "spring: an end that does not exist moves to the first valid minute after it",
    publisher: { weeklyRules: [rule(SUN, "01:00", "02:30")] },
    ...MADRID_SPRING,
    expected: ["2027-03-28T00:00Z/2027-03-28T01:00Z"],
  },
  {
    name: "spring: a rule entirely inside the missing hour gives nothing",
    publisher: { weeklyRules: [rule(SUN, "02:00", "03:00")] },
    ...MADRID_SPRING,
    expected: [],
  },
  {
    name: "spring: 09:00 stays 09:00 on the wall across the change",
    publisher: {
      weeklyRules: [
        rule(SAT, "09:00", "10:00"),
        rule(SUN, "09:00", "10:00"),
        rule(MON, "09:00", "10:00"),
      ],
    },
    ...MADRID_SPRING,
    expected: [
      "2027-03-27T08:00Z/2027-03-27T09:00Z",
      "2027-03-28T07:00Z/2027-03-28T08:00Z",
      "2027-03-29T07:00Z/2027-03-29T08:00Z",
    ],
  },
  {
    name: "spring: a block over the change removes the days it covers",
    publisher: {
      weeklyRules: [
        rule(SAT, "09:00", "10:00"),
        rule(SUN, "09:00", "10:00"),
        rule(MON, "09:00", "10:00"),
      ],
      exceptions: [block("2027-03-27T12:00Z", "2027-03-29T00:00Z")],
    },
    ...MADRID_SPRING,
    expected: ["2027-03-27T08:00Z/2027-03-27T09:00Z", "2027-03-29T07:00Z/2027-03-29T08:00Z"],
  },
  {
    name: "spring: rounding over the change lands on the local grid",
    publisher: {
      precisionMinutes: 60,
      // 01:50 before the change to 05:00 after it
      manualSlots: [slot("2027-03-28T00:50Z", "2027-03-28T03:00Z")],
    },
    ...MADRID_SPRING,
    // 03:00–05:00 local
    expected: ["2027-03-28T01:00Z/2027-03-28T03:00Z"],
  },
  {
    name: "autumn: a start that happens twice uses the earlier instant",
    publisher: { weeklyRules: [rule(SUN, "02:30", "03:30")] },
    ...MADRID_AUTUMN,
    expected: ["2027-10-31T00:30Z/2027-10-31T02:30Z"],
  },
  {
    name: "autumn: an end that happens twice uses the earlier instant",
    publisher: { weeklyRules: [rule(SUN, "01:00", "02:30")] },
    ...MADRID_AUTUMN,
    expected: ["2027-10-30T23:00Z/2027-10-31T00:30Z"],
  },
  {
    name: "autumn: a rule inside the repeated hour uses its first pass",
    publisher: { weeklyRules: [rule(SUN, "02:15", "02:45")] },
    ...MADRID_AUTUMN,
    expected: ["2027-10-31T00:15Z/2027-10-31T00:45Z"],
  },
  {
    name: "autumn: a rule over the whole repeated hour is an hour longer",
    publisher: { weeklyRules: [rule(SUN, "02:00", "03:00")] },
    ...MADRID_AUTUMN,
    expected: ["2027-10-31T00:00Z/2027-10-31T02:00Z"],
  },
  {
    name: "autumn: 09:00 stays 09:00 on the wall across the change",
    publisher: {
      weeklyRules: [
        rule(SAT, "09:00", "10:00"),
        rule(SUN, "09:00", "10:00"),
        rule(MON, "09:00", "10:00"),
      ],
    },
    ...MADRID_AUTUMN,
    expected: [
      "2027-10-30T07:00Z/2027-10-30T08:00Z",
      "2027-10-31T08:00Z/2027-10-31T09:00Z",
      "2027-11-01T08:00Z/2027-11-01T09:00Z",
    ],
  },
]);

table("daylight saving in other zones", [
  {
    // 02:00 EST becomes 03:00 EDT on Sunday 2027-03-14, at 07:00Z.
    name: "America/New_York spring: a rule across the missing hour",
    publisher: { timeZone: "America/New_York", weeklyRules: [rule(SUN, "01:30", "03:30")] },
    from: "2027-03-13T00:00Z",
    to: "2027-03-16T00:00Z",
    expected: ["2027-03-14T06:30Z/2027-03-14T07:30Z"],
  },
  {
    name: "America/New_York spring: a rule inside the missing hour gives nothing",
    publisher: { timeZone: "America/New_York", weeklyRules: [rule(SUN, "02:15", "02:45")] },
    from: "2027-03-13T00:00Z",
    to: "2027-03-16T00:00Z",
    expected: [],
  },
  {
    // 02:00 EDT becomes 01:00 EST on Sunday 2027-11-07, at 06:00Z.
    name: "America/New_York autumn: a start in the repeated hour uses the earlier instant",
    publisher: { timeZone: "America/New_York", weeklyRules: [rule(SUN, "01:30", "02:00")] },
    from: "2027-11-06T00:00Z",
    to: "2027-11-09T00:00Z",
    expected: ["2027-11-07T05:30Z/2027-11-07T07:00Z"],
  },
  {
    name: "America/New_York autumn: a rule crossing midnight into the repeated hour",
    publisher: { timeZone: "America/New_York", weeklyRules: [rule(SAT, "22:00", "01:30")] },
    from: "2027-11-06T00:00Z",
    to: "2027-11-09T00:00Z",
    expected: ["2027-11-07T02:00Z/2027-11-07T05:30Z"],
  },
  {
    // 02:00 AEST becomes 03:00 AEDT on Sunday 2027-10-03, at 16:00Z the day before.
    name: "Australia/Sydney: the southern spring is in October",
    publisher: { timeZone: "Australia/Sydney", weeklyRules: [rule(SUN, "02:30", "03:30")] },
    from: "2027-10-01T00:00Z",
    to: "2027-10-05T00:00Z",
    expected: ["2027-10-02T16:00Z/2027-10-02T16:30Z"],
  },
  {
    // 02:00 (+10:30) becomes 02:30 (+11) on Sunday 2027-10-03, at 15:30Z the day before.
    name: "Australia/Lord_Howe: a half-hour change, start in the missing half hour",
    publisher: { timeZone: "Australia/Lord_Howe", weeklyRules: [rule(SUN, "02:15", "03:00")] },
    from: "2027-10-01T00:00Z",
    to: "2027-10-05T00:00Z",
    expected: ["2027-10-02T15:30Z/2027-10-02T16:00Z"],
  },
  {
    // 02:00 (+11) becomes 01:30 (+10:30) on Sunday 2027-04-04, at 15:00Z the day before.
    name: "Australia/Lord_Howe: a half-hour change, start in the repeated half hour",
    publisher: { timeZone: "Australia/Lord_Howe", weeklyRules: [rule(SUN, "01:45", "02:15")] },
    from: "2027-04-02T00:00Z",
    to: "2027-04-06T00:00Z",
    expected: ["2027-04-03T14:45Z/2027-04-03T15:45Z"],
  },
  {
    name: "Australia/Lord_Howe: rounding over a half-hour change stays on the hourly grid",
    publisher: {
      timeZone: "Australia/Lord_Howe",
      precisionMinutes: 60,
      // 01:50 before the change to 05:00 after it
      manualSlots: [slot("2027-10-02T15:20Z", "2027-10-02T18:00Z")],
    },
    from: "2027-10-01T00:00Z",
    to: "2027-10-05T00:00Z",
    // 03:00–05:00 local
    expected: ["2027-10-02T16:00Z/2027-10-02T18:00Z"],
  },
  {
    // 00:00 (+2) becomes 01:00 (+3) on Friday 2027-04-30, at 22:00Z the day before.
    name: "Africa/Cairo: a rule crossing a midnight that does not exist",
    publisher: { timeZone: "Africa/Cairo", weeklyRules: [rule(THU, "22:00", "02:00")] },
    from: "2027-04-28T00:00Z",
    to: "2027-05-02T00:00Z",
    expected: ["2027-04-29T20:00Z/2027-04-29T23:00Z"],
  },
  {
    name: "Africa/Cairo: a rule that starts at a midnight that does not exist",
    publisher: { timeZone: "Africa/Cairo", weeklyRules: [rule(FRI, "00:00", "01:30")] },
    from: "2027-04-28T00:00Z",
    to: "2027-05-02T00:00Z",
    expected: ["2027-04-29T22:00Z/2027-04-29T22:30Z"],
  },
]);

describe("purity", () => {
  it("does not change its arguments and gives the same answer twice", () => {
    const publisher: Publisher = Object.freeze({
      timeZone: "Europe/Madrid",
      horizonWeeks: 4,
      precisionMinutes: 30,
      weeklyRules: Object.freeze([Object.freeze(rule(MON, "09:00", "17:00"))]),
      manualSlots: Object.freeze([
        Object.freeze(slot("2027-01-12T10:10Z", "2027-01-12T11:00Z")),
        Object.freeze(slot("2027-01-12T08:10Z", "2027-01-12T10:10Z")),
      ]),
      exceptions: Object.freeze([
        Object.freeze(block("2027-01-11T11:00Z", "2027-01-11T12:00Z")),
        Object.freeze(block("2027-01-11T10:00Z", "2027-01-11T11:30Z")),
      ]),
    });
    const [from, to] = [at("2027-01-11T00:00Z"), at("2027-01-18T00:00Z")];

    const first = free(publisher, from, to, from);
    const second = free(publisher, from, to, from);

    expect(first.map(show)).toEqual([
      "2027-01-11T08:00Z/2027-01-11T10:00Z",
      "2027-01-11T12:00Z/2027-01-11T16:00Z",
      "2027-01-12T08:30Z/2027-01-12T11:00Z",
    ]);
    expect(second).toEqual(first);
  });
});
