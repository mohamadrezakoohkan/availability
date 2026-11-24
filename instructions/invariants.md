# Invariants

Rules from `SPEC.md` that span features. A change to one feature can break them without touching the code that states them, so check every change against this list. Section numbers refer to `SPEC.md`.

## Availability computation

- All free windows come from the one pure function in §7. The HTML page, the JSON API, the iCal feed and the MCP tools call it; none of them computes windows itself.
- The function does no I/O. It takes the publisher's rows and a time range as arguments, so it can be tested with tables.
- Order of operations: expand weekly rules, union with manual slots, merge, subtract blocks, round inward, clip. Blocks always win.
- A quick block is an ordinary block exception. Do not add a special case for it.
- Rounding is inward only. The output never claims a minute is free that the publisher did not mark free (§3.3).

## Time

- Weekly rules are stored as local wall time (`HH:MM`) and expanded with the publisher's IANA zone at read time. Never store them as UTC, or they stop following daylight saving (§9).
- One-off times (manual slots, exceptions) are converted to UTC on save.
- Every instant in JSON, iCal and MCP output is UTC in RFC 3339.
- Daylight saving: a local time that does not exist moves to the first valid minute after it. An ambiguous local time uses the earlier instant (§7).

## What the public can see

- Public output holds free windows only. Time that is not free is blank and is never labelled busy or given a reason (§4).
- `exceptions.label` appears only in the publisher's own views (§9).
- Unknown, reserved and suspended usernames return the same 404 response, so the response does not reveal which case it is (§4).
- Viewer pages set no cookies, load no analytics and work with JavaScript turned off (§4).

## URLs and caching

- Each format has its own URL (`/@name`, `/@name.json`, `/@name.ics`). Never choose a format from the `Accept` header (§5).
- Only the three default-window responses per publisher are cached, for the lifetime in the `cache.public_ttl_seconds` policy. There is no purge on save.
- Never cache the editor, the publisher's preview, custom-range API calls, MCP calls or anything under `admin.` (§5).

## Policies

- Read every platform limit through `policy(key, user?)`. Do not write the number in code, except as the policy's default (§6.3).
- A new limit is a new policy key with a `zod` schema for its value.
- Resolution order: user override, then global value, then the default in code.

## Accounts and security

- Username uniqueness is enforced by the database unique index. A pre-check is only for the live "is this name free" hint (§3.1).
- The recovery password is never stored or logged in plain text. It never signs anyone in; it only allows registering a new passkey (§3.5).
- A recovery lock applies to recovery only. It must not block passkey sign-in.
- IP addresses are stored only as salted hashes (§10).
- Every publisher and admin form carries a CSRF token (§10).

## Backoffice

- Every admin action is permission-checked on the server, in addition to Cloudflare Access (§6).
- Every operator action and every security-relevant publisher action writes an audit log entry. The audit log is append-only: no update or delete path exists for it (§6.4).
- Audit entries refer to users by internal id and hold no personal data, so they can stay after an account is deleted (§3.4).

## Tests

- Tests run in Vitest with `@cloudflare/vitest-plugin` against a real D1 database. Do not mock D1 (§8).
- The availability function is covered by table-driven tests that include DST transitions in several zones, rules that cross midnight and overlapping blocks (§7).
