# Layout and tooling

## Directories

| Path | Holds |
| --- | --- |
| `src/index.ts` | The Worker entry point: the Hono app and its routes |
| `src/<feature>/` | One directory per feature. `src/availability/` holds the availability function |
| `test/` | Tests, mirroring `src/` (`src/availability/free.ts` → `test/availability/free.test.ts`) |
| `migrations/` | D1 migrations (see [database.md](database.md)) |
| `wrangler.jsonc` | Worker configuration and bindings |

- Name files in kebab-case (`time-zone.ts`).
- The Worker's bindings are typed by the global `Env`, which `npm run types` generates into `worker-configuration.d.ts` from `wrangler.jsonc`. The file is not committed. Run `npm run types` after changing `wrangler.jsonc`; `npm run typecheck` does it for you.
- The D1 binding is `DB`.

## Tooling

- npm is the package manager. Commit `package-lock.json`.
- Biome lints and formats (`npm run lint`, `npm run format`). It is the only linter and formatter; do not add another.
- Biome skips Markdown (`biome.json`), so it does not rewrite `SPEC.md` or these files. Keep it that way.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on every pull request. A new check goes into that one job.

## Dependencies

- `wrangler` is pinned to the exact version that `@cloudflare/vitest-plugin` depends on, so `wrangler dev` and the tests run the same `workerd`. Upgrade the two together.
- `compatibility_date` in `wrangler.jsonc` must not be later than the release date of that `workerd`.
