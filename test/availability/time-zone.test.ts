import { describe, expect, it } from "vitest";
import { instantAt, offsetAt, wallTimeAt } from "../../src/availability/time-zone";

const HOUR = 3_600_000;

/** `2027-03-28 02:30` as a wall time. */
function wall(local: string): number {
  return Date.parse(`${local.replace(" ", "T")}Z`);
}

function utc(instant: number): string {
  return new Date(instant).toISOString().replace(":00.000Z", "Z");
}

describe("offsetAt", () => {
  it.each([
    ["UTC", "2027-01-11T12:00Z", 0],
    ["Europe/Madrid", "2027-01-11T12:00Z", 1 * HOUR],
    ["Europe/Madrid", "2027-07-11T12:00Z", 2 * HOUR],
    ["America/New_York", "2027-01-11T12:00Z", -5 * HOUR],
    ["Asia/Kolkata", "2027-01-11T12:00Z", 5.5 * HOUR],
    ["Asia/Kathmandu", "2027-01-11T12:00Z", 5.75 * HOUR],
    // The offset changes exactly at the transition instant.
    ["Europe/Madrid", "2027-03-28T00:59Z", 1 * HOUR],
    ["Europe/Madrid", "2027-03-28T01:00Z", 2 * HOUR],
  ])("%s at %s", (timeZone, instant, expected) => {
    expect(offsetAt(Date.parse(instant), timeZone)).toBe(expected);
  });

  it("rejects an unknown zone", () => {
    expect(() => offsetAt(0, "Mars/Olympus_Mons")).toThrow(RangeError);
  });
});

describe("wallTimeAt", () => {
  it("is the local clock reading", () => {
    expect(wallTimeAt(Date.parse("2027-01-11T08:00Z"), "Europe/Madrid")).toBe(
      wall("2027-01-11 09:00"),
    );
  });
});

describe("instantAt", () => {
  it.each([
    ["an ordinary time", "Europe/Madrid", "2027-01-11 09:00", "2027-01-11T08:00Z"],
    ["an ordinary time in summer", "Europe/Madrid", "2027-07-11 09:00", "2027-07-11T07:00Z"],
    [
      "later on the day clocks go forward",
      "Europe/Madrid",
      "2027-03-28 12:00",
      "2027-03-28T10:00Z",
    ],
    ["later on the day clocks go back", "Europe/Madrid", "2027-10-31 12:00", "2027-10-31T11:00Z"],
    ["the last minute before a gap", "Europe/Madrid", "2027-03-28 01:59", "2027-03-28T00:59Z"],
    ["the first minute of a gap", "Europe/Madrid", "2027-03-28 02:00", "2027-03-28T01:00Z"],
    ["the middle of a gap", "Europe/Madrid", "2027-03-28 02:30", "2027-03-28T01:00Z"],
    ["the first minute after a gap", "Europe/Madrid", "2027-03-28 03:00", "2027-03-28T01:00Z"],
    [
      "a repeated time uses its first pass",
      "Europe/Madrid",
      "2027-10-31 02:30",
      "2027-10-31T00:30Z",
    ],
    ["the end of a repeated hour", "Europe/Madrid", "2027-10-31 03:00", "2027-10-31T02:00Z"],
    ["a zone west of UTC, in a gap", "America/New_York", "2027-03-14 02:30", "2027-03-14T07:00Z"],
    ["a zone west of UTC, repeated", "America/New_York", "2027-11-07 01:30", "2027-11-07T05:30Z"],
    // Samoa skipped the whole of 2011-12-30 when it crossed the date line.
    ["a whole day that does not exist", "Pacific/Apia", "2011-12-30 12:00", "2011-12-30T10:00Z"],
  ])("%s", (_name, timeZone, local, expected) => {
    expect(utc(instantAt(wall(local), timeZone))).toBe(expected);
  });
});
