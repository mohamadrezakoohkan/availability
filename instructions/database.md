# Database and migrations

## Migrations

- One file per migration in `migrations/`, named `NNNN_what_it_does.sql` with a four-digit number (`0001_initial_schema.sql`). `npx wrangler d1 migrations create DB <name>` creates the next one.
- Never edit a migration that has been applied to the production database. Add a new one. Until the first deploy (M4) there is no production database, so `0001` can still be changed.
- `npm run migrate:local` applies migrations to the local database that `npm run dev` uses. Tests apply them by themselves (see [testing.md](testing.md)).
- A migration that changes what a table holds changes `SPEC.md` §9 in the same change.

## Columns

- Tables and columns are `snake_case`, with the names in `SPEC.md` §9.
- Instants are `INTEGER`, UTC epoch milliseconds. Their names end in `_at`, `_utc` or `_until`.
- Local times of day are `TEXT` `HH:MM`. Local dates are `TEXT` `YYYY-MM-DD`. Both compare correctly as strings.
- JSON is `TEXT`, in a column whose name ends in `_json`.
- A column is `NOT NULL` unless §9 marks it `NULL`.
- No column has a `DEFAULT`. The code writes every column, so a default value lives in one place (and a default that is a platform limit lives in a policy).
- A column with a fixed set of values has a `CHECK (… IN (…))`. Do not use `CHECK` for a value that a policy governs, such as the allowed horizons.

## Keys

- Surrogate ids are `INTEGER PRIMARY KEY AUTOINCREMENT`. `AUTOINCREMENT` matters: without it SQLite can reuse the id of a deleted row, and an audit entry about a deleted user would then point at a new one.
- `passkeys.id` and `sessions.id` are `TEXT`, because their values come from outside the database.
- Rows that are a user's personal data reference `users (id) ON DELETE CASCADE`, so deleting the user removes them at once (§3.4). Rows that must outlive the account use `ON DELETE SET NULL` (`username_history`, `operators`).
- `audit_log` has no foreign keys. Its entries stay after the rows they describe are gone.
- Every foreign-key column has an index.
