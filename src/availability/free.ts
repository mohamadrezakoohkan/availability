/**
 * The one place free windows are computed (SPEC.md §7). The HTML page, the
 * JSON API, the iCal feed and the MCP tools all call `free`; none of them
 * computes windows itself.
 *
 * `free` does no I/O and reads no clock: the caller passes the publisher's
 * rows, the range and the current instant.
 */

import { DAY, instantAt, MINUTE, offsetAt, wallTimeAt } from "./time-zone";

/** UTC epoch milliseconds. */
export type Instant = number;

export interface WeeklyRule {
  /** 0 = Sunday … 6 = Saturday, in the publisher's zone. */
  weekday: number;
  /** Local wall time, `HH:MM`. */
  startLocal: string;
  /** Local wall time, `HH:MM`. At or before `startLocal` means the next day. */
  endLocal: string;
  /** Local date `YYYY-MM-DD` of the first day the rule applies, or null. */
  validFrom: string | null;
  /** Local date `YYYY-MM-DD` of the last day the rule applies, or null. */
  validUntil: string | null;
}

export interface ManualSlot {
  startUtc: Instant;
  endUtc: Instant;
}

export interface Exception {
  kind: "block";
  startUtc: Instant;
  endUtc: Instant;
}

/** What `free` needs to know about a publisher: settings and rows. */
export interface Publisher {
  /** IANA zone name. */
  timeZone: string;
  horizonWeeks: number;
  precisionMinutes: number;
  weeklyRules: readonly WeeklyRule[];
  manualSlots: readonly ManualSlot[];
  exceptions: readonly Exception[];
}

/** A free window: `start` inclusive, `end` exclusive. */
export interface Window {
  start: Instant;
  end: Instant;
}

/**
 * The publisher's free windows between `from` and `to`, as seen at `now`.
 * Sorted, not overlapping, never in the past and never beyond the horizon.
 */
export function free(publisher: Publisher, from: Instant, to: Instant, now: Instant): Window[] {
  const rangeStart = Math.max(from, now);
  const rangeEnd = Math.min(to, now + publisher.horizonWeeks * 7 * DAY);
  if (rangeStart >= rangeEnd) return [];

  const marked = merge([
    ...expand(publisher.weeklyRules, publisher.timeZone, rangeStart, rangeEnd),
    ...publisher.manualSlots.map((slot) => ({ start: slot.startUtc, end: slot.endUtc })),
  ]);

  const blocks = merge(
    publisher.exceptions
      .filter((exception) => exception.kind === "block")
      .map((block) => ({ start: block.startUtc, end: block.endUtc })),
  );

  const step = publisher.precisionMinutes * MINUTE;
  return subtract(marked, blocks)
    .map((window) => roundInward(window, step, publisher.timeZone))
    .map((window) => ({
      start: Math.max(window.start, rangeStart),
      end: Math.min(window.end, rangeEnd),
    }))
    .filter(isNotEmpty);
}

function isNotEmpty(window: Window): boolean {
  return window.start < window.end;
}

/** `HH:MM` as milliseconds after local midnight. */
function timeOfDay(local: string): number {
  const [hours, minutes] = local.split(":").map(Number);
  return ((hours ?? 0) * 60 + (minutes ?? 0)) * MINUTE;
}

/**
 * Step 1: each weekly rule becomes one window per matching local date, placed
 * in UTC by the publisher's zone. Covers every window that can touch the range.
 */
function expand(
  rules: readonly WeeklyRule[],
  timeZone: string,
  rangeStart: Instant,
  rangeEnd: Instant,
): Window[] {
  if (rules.length === 0) return [];

  // Local midnights as wall times. The day before the range is included
  // because a rule that crosses midnight can start there and end inside.
  const firstDay = Math.floor(wallTimeAt(rangeStart, timeZone) / DAY) * DAY - DAY;
  const lastDay = Math.floor(wallTimeAt(rangeEnd, timeZone) / DAY) * DAY;

  const windows: Window[] = [];
  for (let day = firstDay; day <= lastDay; day += DAY) {
    const date = new Date(day);
    const weekday = date.getUTCDay();
    const isoDate = date.toISOString().slice(0, 10);

    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      if (rule.validFrom !== null && isoDate < rule.validFrom) continue;
      if (rule.validUntil !== null && isoDate > rule.validUntil) continue;

      const startOfDay = timeOfDay(rule.startLocal);
      const endOfDay = timeOfDay(rule.endLocal);
      // A rule that crosses midnight ends on the next date. Converting that
      // end with the next date's zone rules gives the same result as
      // splitting the rule at midnight and merging the two halves.
      const endDay = endOfDay <= startOfDay ? day + DAY : day;

      const window = {
        start: instantAt(day + startOfDay, timeZone),
        end: instantAt(endDay + endOfDay, timeZone),
      };
      if (isNotEmpty(window)) windows.push(window);
    }
  }
  return windows;
}

/** Step 2: sorted windows with overlapping or touching ones joined. */
function merge(windows: readonly Window[]): Window[] {
  const sorted = windows.filter(isNotEmpty).sort((a, b) => a.start - b.start);
  const merged: Window[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

/** Step 3: `windows` with every part covered by a block removed. Both merged. */
function subtract(windows: readonly Window[], blocks: readonly Window[]): Window[] {
  const result: Window[] = [];
  for (const window of windows) {
    let start = window.start;
    for (const block of blocks) {
      if (block.end <= start) continue;
      if (block.start >= window.end) break;
      if (block.start > start) result.push({ start, end: block.start });
      start = block.end;
    }
    if (start < window.end) result.push({ start, end: window.end });
  }
  return result;
}

/**
 * Step 4: the start moves later and the end moves earlier, each to a multiple
 * of `step` on the publisher's local clock. The result never covers a minute
 * the input did not. It can be empty.
 */
function roundInward(window: Window, step: number, timeZone: string): Window {
  return {
    start: alignLocal(window.start, step, timeZone, 1),
    end: alignLocal(window.end, step, timeZone, -1),
  };
}

function alignLocal(instant: Instant, step: number, timeZone: string, direction: 1 | -1): Instant {
  let aligned = instant;
  // One pass is enough unless the move crosses a zone transition that is not
  // a multiple of `step`; then the local clock is off the grid again.
  for (let pass = 0; pass < 3; pass++) {
    const local = aligned + offsetAt(aligned, timeZone);
    const past = ((local % step) + step) % step;
    if (past === 0) break;
    aligned += direction === 1 ? step - past : -past;
  }
  return aligned;
}
