declare namespace Cloudflare {
  interface Env {
    /** Set in vitest.config.ts; applied to the test database by apply-migrations.ts. */
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
