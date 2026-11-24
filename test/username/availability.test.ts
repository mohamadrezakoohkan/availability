import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { checkUsername } from "../../src/username/availability";

const NOW = Date.parse("2027-01-11T00:00:00Z");
const DAY = 86_400_000;

async function insertUser(username: string, state: "active" | "suspended" = "active") {
  await env.DB.prepare(
    `INSERT INTO users (
       username, display_name, note, avatar_url, time_zone, page_state,
       horizon_weeks, precision_minutes, availability_updated_at, state,
       recovery_hash, recovery_salt, recovery_failed_count, signup_ip_hash,
       created_at, updated_at, last_renamed_at
     ) VALUES (?, '', '', '', 'Europe/Madrid', 'unlisted', 4, 30, ?, ?, 'h', 's', 0, 'ip', ?, ?, ?)`,
  )
    .bind(username, NOW, state, NOW, NOW, NOW)
    .run();
}

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM username_history; DELETE FROM reserved_usernames; DELETE FROM policies; DELETE FROM users;",
  );
});

describe("checkUsername", () => {
  it("says a free name is available, in its stored form", async () => {
    expect(await checkUsername(env.DB, "Alice", NOW)).toEqual({
      status: "available",
      username: "alice",
    });
  });

  it("says a name in use is taken, whatever its case", async () => {
    await insertUser("alice");

    expect(await checkUsername(env.DB, "alice", NOW)).toEqual({
      status: "taken",
      username: "alice",
    });
    expect(await checkUsername(env.DB, "ALICE", NOW)).toEqual({
      status: "taken",
      username: "alice",
    });
  });

  it("says a suspended user's name is still taken", async () => {
    await insertUser("alice", "suspended");

    expect((await checkUsername(env.DB, "alice", NOW)).status).toBe("taken");
  });

  it.each(["admin", "api", "www", "help", "mcp", "signup", "recover", "busy"])(
    "says the built-in name %s is reserved",
    async (name) => {
      expect(await checkUsername(env.DB, name, NOW)).toEqual({
        status: "reserved",
        username: name,
      });
    },
  );

  it("says a name on the operator's list is reserved", async () => {
    await env.DB.prepare(
      "INSERT INTO reserved_usernames (username, reason, created_by, created_at) VALUES ('acme', 'brand', 1, ?)",
    )
      .bind(NOW)
      .run();

    expect(await checkUsername(env.DB, "Acme", NOW)).toEqual({
      status: "reserved",
      username: "acme",
    });
  });

  it("says reserved before taken when a name is both", async () => {
    await insertUser("acme");
    await env.DB.prepare(
      "INSERT INTO reserved_usernames (username, reason, created_by, created_at) VALUES ('acme', 'brand', 1, ?)",
    )
      .bind(NOW)
      .run();

    expect((await checkUsername(env.DB, "acme", NOW)).status).toBe("reserved");
  });

  describe("a released name", () => {
    async function release(username: string, heldUntil: number) {
      await env.DB.prepare(
        "INSERT INTO username_history (username, user_id, released_at, held_until) VALUES (?, NULL, ?, ?)",
      )
        .bind(username, NOW - 10 * DAY, heldUntil)
        .run();
    }

    it("is taken while it is held", async () => {
      await release("old-name", NOW + DAY);

      expect((await checkUsername(env.DB, "old-name", NOW)).status).toBe("taken");
    });

    it("is available again once the hold has ended", async () => {
      await release("old-name", NOW - 1);

      expect((await checkUsername(env.DB, "old-name", NOW)).status).toBe("available");
    });

    it("is available at the very moment the hold ends", async () => {
      await release("old-name", NOW);

      expect((await checkUsername(env.DB, "old-name", NOW)).status).toBe("available");
    });
  });

  it("reports why an invalid name is invalid", async () => {
    expect(await checkUsername(env.DB, "a", NOW)).toEqual({
      status: "invalid",
      reason: "too_short",
    });
    expect(await checkUsername(env.DB, "al ice", NOW)).toEqual({
      status: "invalid",
      reason: "characters",
    });
  });

  it("takes the length limits from the policies", async () => {
    await env.DB.prepare(
      "INSERT INTO policies (key, scope, user_id, value_json, version, updated_by, updated_at) VALUES ('username.min_length', 'global', NULL, '5', 1, 1, ?)",
    )
      .bind(NOW)
      .run();

    expect(await checkUsername(env.DB, "abcd", NOW)).toEqual({
      status: "invalid",
      reason: "too_short",
    });
    expect((await checkUsername(env.DB, "abcde", NOW)).status).toBe("available");
  });
});
