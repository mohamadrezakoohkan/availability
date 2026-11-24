# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Availability (working name) is a public, read-only page that shows when a person is free. A publisher claims a username and enters their free time; anyone can read it at `/@username` as HTML, JSON, iCalendar or through MCP tools. Viewers never write anything, and the system stores free time only, never event details.

`SPEC.md` is the product and architecture spec (draft v0.2). It is what this repository builds, milestone by milestone (§12). Read the sections a change touches before working on it.

## Current state

Milestone M0 (foundation) is in place: the Worker skeleton with a `/health` route, the D1 schema of `SPEC.md` §9 as the first migration, CI, and the availability function `free()` with its test table. M1 (Publisher) has started: `policy()` with the typed policy definitions (`src/policy/`) and the username rules and availability check (`src/username/`, `GET /api/v1/usernames/:username`). Sign-up, passkeys, recovery, the editor and the rest of M1 are not built yet.

## Pipeline

Every change goes through the same steps, in this order:

```
spec → code → verify → ship
```

| Step | What does it | Reads `instructions/` |
| --- | --- | --- |
| spec | The first user message in the chat | — |
| code | The `code` skill in this repo | Yes |
| verify | Anthropic's built-in `verify` skill | No |
| ship | Anthropic's built-in `/ship` | No |

**The spec is the first user message in the chat.** There is no spec-writing step and no spec file per change. Later messages refine the spec. `SPEC.md` is the whole product; the first message says which part of it this chat delivers.

Do not skip a step or change the order. A change that has not passed verify is not ready to ship.

## Code

Use the `code` skill (`.claude/skills/code/SKILL.md`) for every change to code in this repository, including when the request does not name it.

The skill reads the conventions in `instructions/` and the code the change touches before it writes anything. It also adds to `instructions/` when a change sets a convention that later changes must follow. `instructions/README.md` is the index, and `instructions/invariants.md` holds the rules from `SPEC.md` that every change must keep.

The code step leaves its changes uncommitted.

## Verify

Run Anthropic's built-in `verify` skill after the code step. It is used as shipped: this repository adds no skill and no `instructions/` files for it.

A change is verified when both are true:

- The tests pass.
- The changed behaviour has been observed in the running Worker, not only in tests.

For a change to public output, observe every interface that carries it. The HTML page, `/@name.json`, `/@name.ics` and the MCP tools must return the same computed data (`SPEC.md` §5).

If the session has no `verify` skill, do the same check by hand with the `run` skill and the test suite, and say that you did.

If verify fails, return to the code step. Do not go on to ship.

## Ship

Shipping is Anthropic's built-in `/ship`. It is used as shipped: this repository adds no skill and no `instructions/` files for it, and the ship step does not read `instructions/`.

Only the user starts it, by typing `/ship`. When verify passes, report that the change is ready and tell the user to type `/ship`. Do not commit, push or open a pull request yourself in its place.

`/ship` commits, pushes, opens the pull request, reviews it and watches it. It never merges; the user merges.

## Commands

Node 22 (`.nvmrc`) and npm. Run `npm ci` first.

| Command | Does |
| --- | --- |
| `npm run dev` | Runs the Worker locally with Wrangler on `http://localhost:8787`, with a local D1 database |
| `npm run migrate:local` | Applies `migrations/` to that local database. Run it before `npm run dev` on a fresh checkout and after adding a migration |
| `npm test` | Runs all tests once, inside `workerd`, against a real D1 database with the migrations applied |
| `npx vitest run test/availability/free.test.ts` | Runs one test file |
| `npx vitest run -t "weekday 0 is Sunday"` | Runs the tests whose name matches |
| `npx vitest` | Watch mode |
| `npm run lint` | Biome: lint and format check |
| `npm run format` | Biome: fix formatting and safe lint fixes |
| `npm run typecheck` | Regenerates `worker-configuration.d.ts` from `wrangler.jsonc`, then type-checks `src/` and `test/` |
| `npm run build` | Bundles the Worker without deploying (`wrangler deploy --dry-run`) |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on every pull request.

Nothing deploys yet. `wrangler.jsonc` holds a placeholder `database_id` until the first deploy in M4.

## Architecture

One Cloudflare Worker (Hono, TypeScript, Hono JSX) serves everything from one D1 database:

- public pages and machine formats: `/@name`, `/@name.json`, `/@name.ics`, `/mcp`
- the publisher's editor and passkey auth
- the operator backoffice on `admin.<domain>`, behind Cloudflare Access and the app's own role check

Three ideas shape most of the code:

- **One availability function.** `free(publisher, from, to)` (`SPEC.md` §7) is pure, does no I/O, and is the only place free windows are computed. All four public interfaces call it.
- **Policies, not constants.** Platform limits are typed, versioned policies that the operator edits in the backoffice. Code reads them only through `policy(key, user?)` (§6.3).
- **Short cache, no purge.** The three default-window responses per publisher are cached at the edge for 60 seconds. Edits appear when the entry expires. The page recomputes "free now" in the browser, so a cached page is not wrong about the present (§5).

The data model is in `SPEC.md` §9 and the full list of cross-feature rules is in `instructions/invariants.md`.
