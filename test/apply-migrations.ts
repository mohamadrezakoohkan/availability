import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Runs before every test file. Applying is idempotent: migrations already
// recorded in d1_migrations are skipped.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
