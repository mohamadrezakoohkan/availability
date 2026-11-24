# instructions/

Code conventions for this repository. The `code` skill (`.claude/skills/code/SKILL.md`) reads this index, then the files that apply to the change. The verify and ship steps do not read this folder.

## Index

| File | Covers | Read when |
| --- | --- | --- |
| [invariants.md](invariants.md) | Rules from `SPEC.md` that span features and must hold in all code | Every change |

There is no application code yet, so there are no layout, naming or command conventions. The change that creates the scaffold (M0 in `SPEC.md` §12) records them here.

## Stack

The stack is fixed in `SPEC.md` §8: Cloudflare Workers, Hono with Hono JSX, D1, `zod`, `@simplewebauthn/server`, Vitest with `@cloudflare/vitest-pool-workers`. Do not add a dependency that does the job of one listed there.

## Adding a convention

- One file per topic, named for the topic (`testing.md`, `migrations.md`).
- Add a row to the index with a "Read when" that tells the reader whether the file applies to their change.
- State each rule as an instruction, and give the reason when it is not obvious.
- Record what the code already does. A rule for code that does not exist goes in `SPEC.md`, not here.
- When a rule here and `SPEC.md` disagree, raise it with the user. Do not pick one silently.
