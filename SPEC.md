# Availability — product and architecture spec

Status: draft v0.2, 2026-11-22. Working name "Availability"; the product name and domain are still open (see [Open questions](#13-open-questions)).

## 1. What this is

A public, read-only page that shows when a person is free. A person (the **publisher**) claims a unique username and says when they are available. Anyone (a **viewer**, human or AI agent) can open `https://<domain>/@username` and see those windows. That is all a viewer can do.

It replaces the one thing most people use a shared Google Calendar for: telling others "this is when you can reach me".

### Principles

1. **Read-only for the public.** Viewers never write anything: no booking, no requests, no messages, no accounts.
2. **Free time only.** The system stores and shows *when the publisher is free*. It never holds event titles, attendees or locations, so it cannot leak them.
3. **The publisher decides how much is visible.** How far ahead, at what precision, and whether the page is public at all.
4. **Machine-readable by default.** Every page a human can read is also available as JSON, iCalendar and an MCP tool, so AI assistants can answer "when can I reach @alice?" without scraping HTML.
5. **Boring open-web standards.** Passkeys, HTTP/3, iCalendar, OpenAPI, MCP. No wallets or blockchains.

### Out of scope (v1)

- Booking, invitations, meeting links, reminders or notifications
- Event details of any kind
- Teams, shared calendars, "find a time for 5 people"
- Importing busy times from Google Calendar or iCal feeds (candidate for v2, see §12)
- Native mobile apps

## 2. Actors

| Actor | Who | Signs in? | Can do |
| --- | --- | --- | --- |
| **Publisher** | A person sharing their availability | Yes (passkey) | Claim a username, set availability, control visibility |
| **Viewer** | Anyone on the web | No | Read a publisher's free windows |
| **Agent** | AI assistant or other software acting for a viewer | No (optional API key for higher rate limits, later) | Same as viewer, through JSON / iCal / MCP |
| **Operator** | You, and any admins you appoint | Yes (passkey + Cloudflare Access) | Manage users, usernames, permissions and platform rules in the backoffice |

## 3. Publisher experience

### 3.1 Sign-up and username

1. Visitor opens `/signup`, types a username, sees live availability of the name ("@alice is free" / "taken" / "reserved").
2. Passes a bot check (Cloudflare Turnstile, invisible for most people).
3. Registers a passkey (WebAuthn). The passkey is the only way to sign in.
4. Types a recovery password (§3.5). Email is optional and used only so the operator can contact the publisher.
5. Picks their IANA time zone (pre-filled from the browser).
6. Lands in the editor with an empty schedule and a banner: "Your page is not public yet. Accounts that never publish are removed after 30 days."

**Username rules**

| Rule | Value | Why |
| --- | --- | --- |
| Characters | `a–z`, `0–9`, `-` | ASCII only removes look-alike (homoglyph) impersonation |
| Length | 3–30 | Short enough to type, long enough to be meaningful |
| Shape | No leading, trailing or double `-` | Readable URLs |
| Case | Stored and compared lowercase | `@Alice` and `@alice` are the same person |
| Uniqueness | Enforced by a database unique index, not just a pre-check | Two simultaneous sign-ups cannot both win |
| Reserved | Operator-managed list (`admin`, `api`, `www`, `help`, `mcp`, `signup`, brand names, …) | Protects routes and prevents impersonation |
| Rename | Allowed, at most once per 30 days | Limits churn |
| Released names | Old name redirects to the new one and is held for 90 days before anyone else can claim it | Old links keep working; nobody can grab a name to impersonate its previous owner |
| Sign-up limit | Bot check on every sign-up, and at most 3 new accounts per IP address per day | A script cannot register names in bulk |
| Unused names | An account that has not published a schedule within 30 days of sign-up is deleted and its name is free again at once | Names go to people who use them. The name was never public, so no hold is needed |

The limits above (lengths, 3 per day, 30 and 90 days) are platform rules the operator can change in the backoffice (§6.3).

### 3.2 Setting availability

A publisher's availability is built from four kinds of input:

| Input | Example | Repeats? |
| --- | --- | --- |
| **Weekly rule** | Mon–Fri 09:00–12:00 and 14:00–17:30 | Every week, optionally between a start and end date |
| **Manual slot** | Sat 23 Nov 10:00–13:00 | No, one specific window |
| **Exception** | *Block* 24–31 Dec (holiday); *Block* Tue 26 Nov 09:00–10:00 | No; a block always overrides everything else |
| **Quick block** | "Busy for the next 2 hours", one tap | No; a block that starts now and ends by itself |

The first three are entered in the publisher's own time zone as wall-clock times (09:00 means 09:00 where they live, including across daylight-saving changes).

**Editor UI**

- A week grid. Drag to create a window; a popover asks "every week" (rule) or "only this day" (slot).
- A "Time off" list for block exceptions, with date-range picker.
- A live preview pane: "This is what @alice's visitors see", rendered by the same code as the public page.

**Keeping the page truthful**

Weekly rules describe a normal week, and real days differ. Two features stop the page from drifting away from reality:

- **Quick block.** A "Busy now" button, always visible when signed in and also on a phone-friendly page at `/busy`. Choices: 1 hour, 2 hours, rest of today, or a custom end time. It creates a block from now until then. "I'm free again" removes it early.
- **Last updated.** Every save stamps the schedule, and so does a "Still correct" button in the editor. The public page and every machine format show the stamp ("Updated 3 days ago"), so viewers can judge how much to trust what they see.

### 3.3 Visibility settings

| Setting | Options | Default |
| --- | --- | --- |
| Page state | Public / Unlisted (works by link, excluded from search engines and the directory) / Paused (shows "not sharing availability right now") | Unlisted until the first save, then the publisher chooses |
| Horizon | How far ahead viewers can see: 1, 2, 4, 8 or 12 weeks | 4 weeks |
| Precision | Windows rounded *inward* to 15, 30 or 60 minutes | 30 minutes |
| Display name, short note, avatar | Free text (note ≤ 280 chars), e.g. "Best reached on Signal" | Empty |
| Contact links | Up to 5 links (email, Signal, Telegram, LinkedIn, website). See open question Q2 | None |

Rounding inward means a 09:10–11:50 window shown at 30-minute precision becomes 09:30–11:30: the page never claims someone is free when they are not, and exact edges of their day are not exposed.

### 3.4 Account deletion and export

- **Export:** a publisher can download everything stored about them (profile, rules, slots, exceptions) as one JSON file.
- **Delete:** from settings, confirmed with the passkey. All personal data is removed at once: profile, contact links, rules, slots, exceptions, passkeys, sessions, recovery password hash and email.
- The page returns 404 within 60 seconds (the cache lifetime, §5).
- The username is held for 90 days with no redirect, then anyone can claim it.
- Audit log entries about the account stay, but they keep only the internal user id and carry no personal data.

### 3.5 Recovery password

The recovery password exists for one case: the publisher has lost every device that holds their passkey.

| Aspect | Decision |
| --- | --- |
| What it is | Any string the publisher types at sign-up. Minimum 10 characters, maximum 256, no rules about digits or symbols |
| Required? | Yes. Sign-up does not finish without one |
| Used for | Only the `/recover` page. It never signs anyone in directly |
| Recovery flow | Username + recovery password + bot check → the publisher registers a new passkey → all old passkeys and sessions are removed |
| Changing it | In settings, after signing in with a passkey |
| Storage | Salted scrypt hash. The plain text is never stored or logged |
| Wrong attempts | 5 per username per hour, then recovery for that username is locked for an hour; also limited per IP. Locking affects only recovery, so an attacker cannot lock a publisher out of normal passkey sign-in |
| Audit | Every attempt, success or failure, is written to the audit log; the publisher sees "Recovery used on <date>" after the next sign-in |
| Both lost | If the passkey and the recovery password are both gone, the account cannot be recovered. The operator has nothing to verify identity against and does not reset accounts by hand |

Consequence to accept: this is a password, so its strength depends on what the publisher types. The attempt limits are what protect a weak one.

## 4. Viewer experience

`https://<domain>/@alice`

- Header: display name, `@alice`, note, contact links.
- **Status line**, the main answer: "Free now until 12:00" or "Busy now · next free today at 14:00" or "No availability in the next 4 weeks".
- "Updated 3 days ago" under the status line (§3.2).
- A week view of free windows. The server renders it in the publisher's time zone, clearly labelled. JavaScript converts it to the **viewer's** zone on load, with a toggle back ("Alice's local time: 08:14").
- Previous/next week navigation, limited to the publisher's horizon.
- Free windows are filled; everything else is blank, never labelled "busy" with a reason.
- Works with JavaScript turned off (server-rendered HTML). JS adds the time-zone conversion and recomputes the status line from the window list every minute, so "Free now" stays right even on a cached page.
- No cookies, no tracking, no sign-in prompts for viewers.

Unknown, reserved or suspended usernames return 404 with the same page, so the response does not reveal which of these it is.

## 5. Agent and machine access

Every publisher is reachable four ways. All return the same computed data.

| Interface | URL | Format |
| --- | --- | --- |
| HTML | `GET /@alice` | Server-rendered page |
| JSON | `GET /@alice.json` (default window), or `GET /api/v1/users/alice/availability?from=…&to=…` (custom range) | JSON, schema below |
| iCalendar | `GET /@alice.ics` | One `VEVENT` per free window (RFC 5545), for subscribing from a calendar app |
| MCP | `POST /mcp` (Streamable HTTP transport) | Tools listed below |

Each format has its own URL. The server never chooses a format from the `Accept` header, so a cache can never hand JSON to a browser.

Discovery for agents:

- `/llms.txt` describing the service and URL patterns in plain language
- `/openapi.json` (OpenAPI 3.1) for the REST API
- `<link rel="alternate" type="application/json">` and `type="text/calendar"` on every profile page
- `/.well-known/mcp.json` pointing at the MCP endpoint (whichever discovery convention is current when built)

**JSON response**

```json
{
  "username": "alice",
  "display_name": "Alice Doe",
  "time_zone": "Europe/Madrid",
  "generated_at": "2026-11-22T10:00:00Z",
  "updated_at": "2026-11-19T08:30:00Z",
  "window": { "from": "2026-11-22T10:00:00Z", "to": "2026-12-20T10:00:00Z" },
  "precision_minutes": 30,
  "now": { "free": true, "until": "2026-11-22T11:00:00Z" },
  "next_free": null,
  "free": [
    { "start": "2026-11-22T10:00:00Z", "end": "2026-11-22T11:00:00Z" },
    { "start": "2026-11-22T13:00:00Z", "end": "2026-11-22T16:30:00Z" }
  ]
}
```

All instants are UTC (RFC 3339); `time_zone` lets clients render locally. `generated_at` is when the server computed the answer and `updated_at` is when the publisher last saved or confirmed their schedule. `now` is true as of `generated_at`, which can be up to 60 seconds old; clients that need the exact current state compare the clock with the `free` list.

**iCalendar feed**

Calendar apps show events from a subscribed feed and ignore free/busy components, so each free window is an event:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//<domain>//availability//EN
X-WR-CALNAME:Alice Doe is free
REFRESH-INTERVAL;VALUE=DURATION:PT1H
X-PUBLISHED-TTL:PT1H
BEGIN:VEVENT
UID:alice-20261122T100000Z-20261122T110000Z@<domain>
DTSTAMP:20261122T100000Z
DTSTART:20261122T100000Z
DTEND:20261122T110000Z
SUMMARY:Alice Doe is free
URL:https://<domain>/@alice
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR
```

- `TRANSP:TRANSPARENT` means the event does not mark the *subscriber* as busy in their own calendar.
- The `UID` is built from the window's start and end, so a window that did not change keeps its identity between refreshes and does not flicker or duplicate.
- Times are UTC; the calendar app converts to the subscriber's zone.
- The feed covers the same horizon and rounding as the page. A paused or deleted page returns an empty calendar, then 404.
- Calendar apps refresh subscriptions on their own schedule, often hours apart, whatever the feed asks for. The feed is therefore the slowest view; the page, JSON and MCP are the current ones. The profile page says so next to the "Subscribe" link.
- To verify in M2: subscribe to a test feed from Google Calendar, Apple Calendar and Outlook and confirm the windows appear.

**MCP tools**

| Tool | Input | Returns |
| --- | --- | --- |
| `get_availability` | `username`, optional `from`, `to` | The JSON above |
| `is_free` | `username`, `at` (instant) | `{ free, until?, next_free? }` |
| `next_free` | `username`, optional `after`, optional `min_duration_minutes` | First window that fits, or null |

All machine endpoints are read-only, CORS-open (`Access-Control-Allow-Origin: *`) and rate-limited per IP.

**Caching**

| Rule | Detail |
| --- | --- |
| What is cached | The three default-window responses per publisher: `/@alice`, `/@alice.json`, `/@alice.ics`. One cache entry per URL, one format per URL |
| For how long | 60 seconds at the edge (`s-maxage=60`), 30 seconds in the browser |
| How edits appear | No purge step. An edit, a quick block, a pause or a deletion is visible everywhere within 60 seconds. (Cloudflare's cache delete only reaches one data centre, so purging on save would be unreliable) |
| What is never cached | The publisher's own preview and editor, custom-range API calls, MCP calls, and everything under `admin.` |
| Time-dependent parts | The HTML is rendered in the publisher's zone and the status line is recomputed in the browser (§4), so a cached page is not wrong about "now" |
| Database load | A cached response costs no database read. An uncached one costs one read of the publisher's rows |

## 6. Operator backoffice

Lives at `admin.<domain>`, behind Cloudflare Access (only allow-listed identities reach it at all) *and* the app's own role check. Two locks, so a bug in one does not open it.

### 6.1 Permissions

Role-based, with permissions as explicit strings so new ones can be added without schema changes.

| Role | Permissions |
| --- | --- |
| `owner` (you) | Everything, including granting roles |
| `admin` | `users.read`, `users.suspend`, `usernames.manage`, `policies.edit`, `audit.read` |
| `moderator` | `users.read`, `users.suspend`, `audit.read` |
| `support` | `users.read` |

Publishers have no backoffice role. Every grant and revoke is written to the audit log.

### 6.2 User and username management

- Search users by username, email, sign-up date, state.
- View a user's settings and computed public page (never more than what they store, which is already only free time).
- Suspend / unsuspend (page returns 404, sign-in shows a notice).
- Force-rename (impersonation, trademark complaints), release a held name early, add/remove reserved names.
- Revoke all sessions and passkeys for an account.

### 6.3 Rules and conditions (policies)

"Rules and conditions" are typed, versioned **policies** the operator edits in the backoffice instead of in code. Each policy has a key, a JSON value validated against a schema in code, a scope and an audit trail.

| Policy key | Example value | Effect |
| --- | --- | --- |
| `signup.mode` | `open` / `invite_only` / `closed` | Who can create accounts |
| `username.min_length`, `username.max_length` | `3`, `30` | Username validation |
| `username.rename_cooldown_days` | `30` | Rename frequency |
| `username.hold_days` | `90` | How long a released name stays locked |
| `availability.max_horizon_weeks` | `12` | Upper limit publishers can choose |
| `availability.min_precision_minutes` | `15` | Finest rounding allowed |
| `availability.max_rules`, `max_slots`, `max_exceptions` | `50`, `200`, `100` | Abuse limits |
| `ratelimit.public_per_minute` | `120` | Per-IP limit on public and agent endpoints |
| `signup.max_per_ip_per_day` | `3` | Bulk-registration limit |
| `signup.unpublished_expiry_days` | `30` | When a never-published account is deleted |
| `recovery.min_length` | `10` | Shortest recovery password accepted |
| `recovery.max_attempts_per_hour` | `5` | Wrong recovery attempts before the one-hour lock |
| `cache.public_ttl_seconds` | `60` | How long public responses stay cached, which is also how fast edits appear |
| `features.<name>` | `true` / `false` / percentage | Feature flags (e.g. `features.ical_import`) |

**Scopes and resolution:** a policy can be set globally and overridden per user (e.g. a longer horizon for one account). The effective value is: user override → global value → default in code. Code only reads policies through one `policy(key, user?)` function, so adding a new rule is: define its key and schema in code, then manage its value in the backoffice.

Free-form scripting of rules is deliberately not in v1; typed keys keep the backoffice safe and testable.

### 6.4 Audit log

Append-only record of every operator action and every security-relevant publisher action (sign-in, passkey added/removed, rename, visibility change): who, what, when, before/after value. Viewable and filterable in the backoffice; never editable.

### 6.5 Dashboard

Counts only: publishers (total, active in 7 days, public pages), sign-ups per day, API/MCP request volume, rate-limit hits. No per-viewer tracking.

## 7. How availability is computed

One pure function, shared by the HTML page, JSON API, iCal feed and MCP tools:

```
free(publisher, from, to) =
    clip_to(from, to ∩ [now, now + horizon],
      round_inward(precision,
        merge(
          expand(weekly_rules, tz, from, to)
          ∪ manual_slots
        ) − block_exceptions
      )
    )
```

1. **Expand** each weekly rule into concrete local-time windows for every date in range, then convert to UTC using the publisher's IANA zone.
   - Daylight saving: a local time that does not exist (spring forward) moves to the first valid minute after it; an ambiguous time (fall back) uses the earlier instant.
   - Rules crossing midnight (e.g. 22:00–02:00) are allowed and split by date.
2. **Union** with manual slots, then **merge** overlapping or touching windows.
3. **Subtract** block exceptions. Blocks always win.
4. **Round inward** to precision; drop windows that become empty.
5. **Clip** to the request and to the horizon. Nothing in the past, nothing beyond the horizon.

A quick block (§3.2) is an ordinary block exception that starts at the moment it is created, so it needs no special case here.

This function has no I/O, so it is covered by table-driven unit tests, including DST transitions in several zones, midnight-crossing rules, and overlapping blocks.

## 8. Architecture

```
                 HTTP/3 (QUIC) or HTTP/2, negotiated automatically
 Viewer / Agent ───────────────────────────────────────────▶ Cloudflare edge
                                                               │  cache (Cache API)
                                                               ▼
                                                    Worker (Hono, TypeScript)
                                                    ├─ public pages, JSON, .ics, /mcp
                                                    ├─ publisher editor + auth
                                                    └─ admin.* backoffice
                                                               │
                                                               ▼
                                                         D1 (SQLite)
```

| Concern | Choice | Notes |
| --- | --- | --- |
| Runtime | Cloudflare Workers | Global edge, free tier is enough for a personal project |
| Framework | Hono + Hono JSX | Server-rendered HTML, small, runs natively on Workers |
| Interactivity | Small client islands (editor grid, time-zone toggle) | Public pages work without JS |
| Database | D1 | One database; migrations with `wrangler d1 migrations` |
| Auth | Passkeys via `@simplewebauthn/server`; session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) stored in D1 | Sign-in is passkey-only |
| Recovery password | Salted scrypt hash through `node:crypto`; plain text never stored | To check in M1: hashing must fit the Workers CPU limit. The free plan's limit is probably too low, so budget for the paid plan |
| Bot check | Cloudflare Turnstile on sign-up and on `/recover` | Verified server-side |
| Backoffice gate | Cloudflare Access on `admin.<domain>` + app roles | Defence in depth |
| Caching | The Worker stores each public response (`/@name`, `.json`, `.ics`) in the Cache API for 60 seconds, one entry per URL | No purge step; edits appear within 60 seconds. Rules in §5 "Caching" |
| Rate limiting | Workers Rate Limiting binding, limits from policies | |
| Validation | `zod` schemas shared by API, forms and policy values | |
| Tests | Vitest with `@cloudflare/vitest-plugin` | Real D1 in tests |
| Protocols | HTTP/3 and HTTP/2 enabled at the Cloudflare zone; TLS 1.3; HSTS preload | No app code needed: browsers that only speak HTTP/2 get HTTP/2, the rest upgrade to HTTP/3 via `Alt-Svc` |

## 9. Data model (D1)

```sql
users              (id, username UNIQUE, display_name, note, avatar_url, time_zone,
                    page_state, horizon_weeks, precision_minutes,
                    availability_updated_at, first_published_at NULL,
                    state /* active|suspended */, email NULL,
                    recovery_hash, recovery_salt,
                    recovery_failed_count, recovery_locked_until NULL,
                    signup_ip_hash NULL /* cleared after 30 days */,
                    created_at, updated_at, last_renamed_at)
contact_links      (id, user_id, kind, url, position)
passkeys           (id /* credential id */, user_id, public_key, counter,
                    transports, created_at, last_used_at)
sessions           (id, user_id, created_at, expires_at, user_agent_hash)

weekly_rules       (id, user_id, weekday /* 0–6 */, start_local /* HH:MM */,
                    end_local, valid_from NULL, valid_until NULL)
manual_slots       (id, user_id, start_utc, end_utc)
exceptions         (id, user_id, kind /* block */, source /* manual|quick */,
                    start_utc, end_utc, label NULL)

username_history   (username, user_id NULL, released_at, held_until)
                    -- redirects + holds; user_id is NULL after account deletion
reserved_usernames (username, reason, created_by, created_at)

operators          (id, user_id NULL, access_email, created_at)
role_grants        (operator_id, role, granted_by, granted_at)
policies           (key, scope /* global|user */, user_id NULL, value_json,
                    version, updated_by, updated_at)
audit_log          (id, actor_kind, actor_id, action, target_kind, target_id /* text */,
                    before_json NULL, after_json NULL, ip_hash NULL /* cleared after 30 days */,
                    created_at)
```

`exceptions.label` is visible only to the publisher, never in public output. Times entered by the publisher as one-off dates are converted to UTC on save; weekly rules stay in local wall time so they follow daylight-saving changes.

## 10. Non-functional requirements

| Area | Target |
| --- | --- |
| Speed | Public page p95 time-to-first-byte < 150 ms from cache, < 400 ms uncached; page weight < 50 KB without avatar |
| Freshness | An edit is visible on the page, JSON and MCP within 60 seconds. Calendar-app subscriptions refresh on the app's own schedule |
| Availability | Whatever Workers + D1 provide; no extra SLO for v1 |
| Privacy | No viewer cookies or analytics; IPs stored only as salted hashes for rate limiting and audit, kept 30 days; account deletion removes all personal data at once (§3.4) |
| Security | Passkey sign-in; recovery password stored only as a salted hash and attempt-limited; bot check on sign-up and recovery; CSRF tokens on all publisher and admin forms; strict CSP; every admin action permission-checked server-side and audited |
| Accessibility | WCAG 2.2 AA; the free-time list is also available as a plain text list for screen readers, not only a grid |
| Internationalisation | English first; dates and times always formatted with `Intl` in the viewer's locale |
| SEO | Public pages indexable, unlisted ones `noindex`; Open Graph card "When is @alice free?" |

## 11. Abuse and edge cases

- **Squatting:** bot check and per-IP limit at sign-up, deletion of accounts that never publish, reserved list, rename cooldown, held names, operator force-rename.
- **Recovery password guessing:** 5 attempts per username per hour and a per-IP limit, a bot check on the form, every attempt audited. A successful recovery removes all old passkeys and sessions, and the publisher is told about it at next sign-in.
- **Impersonation:** ASCII-only usernames, reserved brand names, operator force-rename. A "verified" badge is a later option.
- **Scraping:** public data by design; rate limits stop bulk load, not reading.
- **Username enumeration at sign-up:** acceptable, because profiles are public anyway; the check endpoint is rate-limited.
- **Lost passkey:** the recovery password (§3.5) lets the publisher register a new one. If both are lost, the account cannot be recovered.
- **Publisher in a zone with frequent DST rule changes:** IANA data ships with the runtime; computing at read time means rule changes apply automatically.

## 12. Delivery plan

| Milestone | Contents | Done when |
| --- | --- | --- |
| **M0 Foundation** | Repo, Workers + D1 + Hono skeleton, CI, migrations, availability function with full tests | `free()` passes the DST/edge-case test table |
| **M1 Publisher** | Passkey sign-up/sign-in with bot check and per-IP limit, recovery password and `/recover`, username claim, weekly rules, manual slots, block exceptions, quick block, "last updated" stamp, visibility settings, preview, export and account deletion, cleanup job for never-published accounts | You can publish your own schedule, lose your passkey and get back in, and delete the account |
| **M2 Viewer + agents** | `/@username` page, `.json` and `.ics` URLs, MCP endpoint, `llms.txt`, OpenAPI, 60-second caching | An AI assistant answers "when is @you free tomorrow?" from the MCP endpoint, and the feed shows up in Google, Apple and Outlook calendars |
| **M3 Backoffice** | Cloudflare Access, roles, user/username management, policies editor, audit log, dashboard | You can suspend a user and change a policy without a deploy |
| **M4 Launch** | Domain, HTTP/3 + HSTS, error monitoring, backups (D1 time travel), privacy page | Public URL live |
| **Later** | A personal token so the publisher's own AI assistant can add blocks and slots for them; import busy times from an iCal URL; verified badges; API keys for agents; multiple schedules per person ("work", "personal"); embed widget | — |

## 13. Open questions

| # | Question | Default if unanswered |
| --- | --- | --- |
| Q1 | Product name and domain? | Working name "Availability" |
| Q2 | Should profiles show contact links, or should the page stay purely "when", with no "how"? | Allow up to 5 optional links |
| Q3 | Can a publisher have more than one schedule (e.g. work and personal) under one username? | No in v1; designed so it can be added |
| Q4 | Is there a public directory or search of publishers, or are pages reachable only by link? | No directory in v1 |
| Q5 | Is the backoffice only for you, or will others have operator roles from day one? | Only you (`owner`) at launch; roles exist for later |
| Q6 | Do agents need API keys from the start, or is anonymous rate-limited access enough? | Anonymous for v1 |
| Q7 | Should viewers be able to see "busy" explicitly, or only the absence of free windows? | Only free windows; blank means not available |

### Decided

| # | Question | Decision (2026-11-22) |
| --- | --- | --- |
| Q8 | Does "manage permissions" mean roles for backoffice staff, or what each publisher is allowed to do? | Both, as specified: staff roles (§6.1) plus per-publisher policy overrides (§6.3) |
| Q9 | Does "extend rules and conditions" mean platform settings, terms and conditions that publishers accept, or new kinds of availability rules? | Platform settings the operator edits in the backoffice (§6.3) |
