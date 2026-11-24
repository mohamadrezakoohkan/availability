# Testing

The rules that tests must keep (real D1, table-driven tests for the availability function) are in [invariants.md](invariants.md), "Tests". This file is how the tests are set up.

## Where tests live and run

- Tests are in `test/`, mirroring `src/`, in files named `*.test.ts`.
- Every test runs inside `workerd` through `@cloudflare/vitest-plugin` (`vitest.config.ts`), including tests of pure functions. Time-zone data in particular must come from the runtime the Worker ships on, not from Node.
- `test/apply-migrations.ts` runs before each test file and applies everything in `migrations/` to the test database. A test never creates tables itself.
- Bindings come from `import { env } from "cloudflare:workers"`. A binding that exists only in tests is declared in `test/env.d.ts`.

## Writing tests

- Call routes with Hono's `app.request(path, init, env)`, passing the real `env`.
- Do not replace `env.DB` or any part of it with a fake, including to force an error.
- A test file that writes rows clears the tables it uses in `beforeEach`. Do not rely on rows from another test.
- Never read the clock in a test. Pass fixed instants.

## Table-driven tests

`test/availability/free.test.ts` is the pattern for the availability function:

- A case is data: a name, the publisher's rows, the range, `now` and the expected windows. Add a case to a table; do not write a new `it` body for it.
- Write instants as UTC strings (`"2027-01-11T08:00Z"`) and expected windows as `"start/end"`, so a failure prints readable times.
- A case that depends on a zone transition says in a comment when the transition happens, in local time and in UTC.
- A new rule about how windows are computed gets a case for each daylight-saving direction it can meet.
