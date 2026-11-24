# instructions/

Code conventions for this repository. The `code` skill (`.claude/skills/code/SKILL.md`) reads this index, then the files that apply to the change. The verify and ship steps do not read this folder.

## Index

| File | Covers | Read when |
| --- | --- | --- |
| [invariants.md](invariants.md) | Rules from `SPEC.md` that span features and must hold in all code | Every change |
| [layout.md](layout.md) | Where files go, file naming, the `Env` type, npm, Biome, CI, how `wrangler` is pinned | Adding a file, a dependency, a binding or a CI check |
| [time.md](time.md) | How instants, local times, weekdays and zones are represented; the one module that applies zone rules; passing `now` | The change handles a time, a date or a time zone |
| [database.md](database.md) | Migration files, column types and nullability, keys and foreign keys | The change adds a migration or writes SQL |
| [testing.md](testing.md) | Where tests live, how they get a migrated D1 database, the table-driven pattern | The change adds or changes a test |

The commands (build, lint, typecheck, test) are in `CLAUDE.md`, "Commands".

## Stack

The stack is fixed in `SPEC.md` §8: Cloudflare Workers, Hono with Hono JSX, D1, `zod`, `@simplewebauthn/server`, Vitest with `@cloudflare/vitest-plugin`. Do not add a dependency that does the job of one listed there.

## Adding a convention

- One file per topic, named for the topic (`testing.md`, `migrations.md`).
- Add a row to the index with a "Read when" that tells the reader whether the file applies to their change.
- State each rule as an instruction, and give the reason when it is not obvious.
- Record what the code already does. A rule for code that does not exist goes in `SPEC.md`, not here.
- When a rule here and `SPEC.md` disagree, raise it with the user. Do not pick one silently.
