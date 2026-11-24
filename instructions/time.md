# Time in code

How instants, local times and time zones are represented. The rules about what is stored in which form are in [invariants.md](invariants.md), "Time".

## Representations

| Kind | Type | Example |
| --- | --- | --- |
| Instant | `number`, UTC epoch milliseconds (`Instant` in `src/availability/free.ts`) | `Date.parse("2027-01-11T08:00:00Z")` |
| Local time of day | `string`, `HH:MM` | `"09:00"` |
| Local date | `string`, `YYYY-MM-DD` | `"2027-01-11"` |
| Wall time | `number`: the local clock reading written as if it were UTC | 09:00 on 2027-01-11 is `Date.UTC(2027, 0, 11, 9)` in every zone |
| Weekday | `number`, 0 = Sunday … 6 = Saturday, in the publisher's zone | `1` is Monday |

- Convert instants to RFC 3339 strings only where output is written (JSON, iCal, MCP). Inside the code they stay numbers.
- A window is `{ start, end }` with `start` inclusive and `end` exclusive.

## Time zones

- `src/availability/time-zone.ts` is the only code that applies zone rules. Go through `instantAt`, `wallTimeAt` and `offsetAt`; do not call `Intl.DateTimeFormat` with a `timeZone` elsewhere for arithmetic. (Formatting a time for display is a different job and is not covered here.)
- `instantAt` implements the daylight-saving rule of `SPEC.md` §7. Any code that turns a local time into an instant must use it, so the rule holds everywhere.
- Do not use `Temporal`. Its default handling of a time that does not exist differs from §7 (it shifts by the length of the gap; §7 moves to the first valid minute).

## The clock

- `free()` takes `now` as an argument and never reads the clock. Callers read the clock once per request and pass it down, so one response is consistent and tests can fix the time.

## Weekly rules and rounding

- A weekly rule whose `end_local` is at or before its `start_local` ends on the next day. Equal start and end mean 24 hours.
- `valid_from` and `valid_until` are inclusive and are compared with the local date the window starts on.
- Rounding to precision uses the publisher's local clock, not UTC, so a UTC+5:30 publisher at 60 minutes gets windows on the local hour.
