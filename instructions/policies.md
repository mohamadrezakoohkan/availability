# Policies

Platform limits the operator edits in the backoffice (SPEC.md §6.3). The rule that code reads limits only through `policy()` is in [invariants.md](invariants.md), "Policies". This file is how that is done.

- Every limit is an entry in `src/policy/definitions.ts`: its key, a `zod` schema for its value and its default. The default there is the only place the limit's number may appear in code.
- Read a limit with `await policy(env.DB, "key", userId?)` from `src/policy/policy.ts`. The result is typed from the key's schema. Pass `userId` only when the limit can be overridden for the user in question.
- `policy()` takes the database as an argument and does no caching. Read a limit once per request and pass the value down; pure functions take the value, not the database (`validateUsername` takes `{ min, max }`).
- A stored value that is not JSON or fails its schema is skipped with a `console.warn`, and the next level (global, then the default) applies. A bad backoffice edit must not remove a limit.
- A new limit: add the entry, then add its value to nothing else. Do not seed `policies` rows in a migration; the default in code is what applies until the operator sets one.
- Test with real rows in `policies` (see `test/policy/policy.test.ts`). Do not mock `policy()`.
