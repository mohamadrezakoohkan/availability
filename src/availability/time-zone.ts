/**
 * Conversion between UTC instants and wall-clock time in an IANA time zone.
 *
 * A "wall time" is what a clock on the wall shows, written as epoch
 * milliseconds as if that clock were in UTC. 09:00 on 2027-03-28 is
 * `Date.UTC(2027, 2, 28, 9, 0)` in every zone. This keeps date arithmetic
 * (next day, weekday) free of time-zone rules.
 *
 * Zone rules come from the runtime's IANA data through `Intl`.
 */

export const MINUTE = 60_000;
export const DAY = 86_400_000;

const SECOND = 1_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Milliseconds the zone is ahead of UTC at `instant`. */
export function offsetAt(instant: number, timeZone: string): number {
  // Zone offsets are whole seconds, so the sub-second part can be set aside.
  const whole = Math.floor(instant / SECOND) * SECOND;
  const field: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(whole)) {
    field[part.type] = Number(part.value);
  }
  const wall = Date.UTC(
    field.year ?? 0,
    (field.month ?? 1) - 1,
    field.day ?? 1,
    field.hour ?? 0,
    field.minute ?? 0,
    field.second ?? 0,
  );
  return wall - whole;
}

/** The wall time shown in `timeZone` at `instant`. */
export function wallTimeAt(instant: number, timeZone: string): number {
  return instant + offsetAt(instant, timeZone);
}

/**
 * The instant at which `timeZone` shows `wallTime`.
 *
 * Daylight saving (SPEC.md §7):
 * - a wall time that does not exist (clocks went forward over it) moves to
 *   the first valid minute after it, which is the instant of the transition;
 * - a wall time that happens twice (clocks went back over it) uses the
 *   earlier instant.
 */
export function instantAt(wallTime: number, timeZone: string): number {
  // No zone is more than a day from UTC, so these two probes lie on either
  // side of any transition that affects this wall time.
  const offsetBefore = offsetAt(wallTime - DAY, timeZone);
  const offsetAfter = offsetAt(wallTime + DAY, timeZone);

  const earlier = wallTime - Math.max(offsetBefore, offsetAfter);
  const later = wallTime - Math.min(offsetBefore, offsetAfter);

  if (wallTimeAt(earlier, timeZone) === wallTime) return earlier;
  if (wallTimeAt(later, timeZone) === wallTime) return later;

  // The wall time is inside a gap. `earlier` is before the transition and
  // `later` is at or after it; find the first second with the new offset.
  const oldOffset = offsetAt(earlier, timeZone);
  let low = Math.floor(earlier / SECOND);
  let high = Math.ceil(later / SECOND);
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (offsetAt(middle * SECOND, timeZone) === oldOffset) low = middle;
    else high = middle;
  }
  return high * SECOND;
}
