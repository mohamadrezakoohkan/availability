import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { policy } from "../../src/policy/policy";

const NOW = Date.parse("2027-01-11T00:00:00Z");

async function insertUser(username: string): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO users (
       username, display_name, note, avatar_url, time_zone, page_state,
       horizon_weeks, precision_minutes, availability_updated_at, state,
       recovery_hash, recovery_salt, recovery_failed_count, signup_ip_hash,
       created_at, updated_at, last_renamed_at
     ) VALUES (?, '', '', '', 'Europe/Madrid', 'unlisted', 4, 30, ?, 'active', 'h', 's', 0, 'ip', ?, ?, ?)
     RETURNING id`,
  )
    .bind(username, NOW, NOW, NOW, NOW)
    .first<{ id: number }>();
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

function setPolicy(key: string, valueJson: string, userId: number | null = null) {
  return env.DB.prepare(
    `INSERT INTO policies (key, scope, user_id, value_json, version, updated_by, updated_at)
     VALUES (?, ?, ?, ?, 1, 1, ?)`,
  )
    .bind(key, userId === null ? "global" : "user", userId, valueJson, NOW)
    .run();
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM policies; DELETE FROM users;");
});

describe("policy", () => {
  it("falls back to the default in code when nothing is stored", async () => {
    expect(await policy(env.DB, "username.max_length")).toBe(30);
    expect(await policy(env.DB, "signup.mode")).toBe("open");
  });

  it("uses the global value over the default", async () => {
    await setPolicy("username.max_length", "20");

    expect(await policy(env.DB, "username.max_length")).toBe(20);
  });

  it("uses a user's override over the global value, for that user only", async () => {
    const alice = await insertUser("alice");
    const bob = await insertUser("bob");
    await setPolicy("availability.max_horizon_weeks", "8");
    await setPolicy("availability.max_horizon_weeks", "24", alice);

    expect(await policy(env.DB, "availability.max_horizon_weeks", alice)).toBe(24);
    expect(await policy(env.DB, "availability.max_horizon_weeks", bob)).toBe(8);
    expect(await policy(env.DB, "availability.max_horizon_weeks")).toBe(8);
  });

  it("uses the default for a user with no override and no global value", async () => {
    const alice = await insertUser("alice");

    expect(await policy(env.DB, "availability.max_horizon_weeks", alice)).toBe(12);
  });

  it("reads a user override on its own key only", async () => {
    const alice = await insertUser("alice");
    await setPolicy("username.hold_days", "10", alice);

    expect(await policy(env.DB, "username.rename_cooldown_days", alice)).toBe(30);
  });

  describe("a stored value that is not valid", () => {
    it.each([
      ["not JSON", "{oops"],
      ["the wrong type", '"twenty"'],
      ["out of range", "0"],
      ["not an integer", "2.5"],
      ["null", "null"],
    ])("is skipped when it is %s", async (_name, json) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await setPolicy("username.max_length", json);

      expect(await policy(env.DB, "username.max_length")).toBe(30);
    });

    it("falls from a bad user override to the global value", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const alice = await insertUser("alice");
      await setPolicy("username.max_length", "20");
      await setPolicy("username.max_length", '"x"', alice);

      expect(await policy(env.DB, "username.max_length", alice)).toBe(20);
    });

    it("rejects a value outside an enum", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await setPolicy("signup.mode", '"maybe"');

      expect(await policy(env.DB, "signup.mode")).toBe("open");
    });
  });
});
