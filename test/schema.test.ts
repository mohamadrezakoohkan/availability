import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const NOW = Date.parse("2027-01-11T00:00:00Z");

async function insertUser(username: string): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO users (
       username, display_name, note, avatar_url, time_zone, page_state,
       horizon_weeks, precision_minutes, availability_updated_at, state,
       recovery_hash, recovery_salt, recovery_failed_count, signup_ip_hash,
       created_at, updated_at, last_renamed_at
     ) VALUES (?, '', '', '', 'Europe/Madrid', 'unlisted', 4, 30, ?, 'active', 'hash', 'salt', 0, 'ip', ?, ?, ?)
     RETURNING id`,
  )
    .bind(username, NOW, NOW, NOW, NOW)
    .first<{ id: number }>();
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

async function count(table: string, userId: number): Promise<number> {
  const row = await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id = ?`)
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM username_history; DELETE FROM users;");
});

describe("schema", () => {
  it("has the tables of SPEC.md §9", async () => {
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
         AND name != 'd1_migrations'
       ORDER BY name`,
    ).all<{ name: string }>();

    expect(results.map((row) => row.name)).toEqual([
      "audit_log",
      "contact_links",
      "exceptions",
      "manual_slots",
      "operators",
      "passkeys",
      "policies",
      "reserved_usernames",
      "role_grants",
      "sessions",
      "username_history",
      "users",
      "weekly_rules",
    ]);
  });

  it("refuses a second user with the same username", async () => {
    await insertUser("alice");

    await expect(insertUser("alice")).rejects.toThrow(/UNIQUE constraint failed: users\.username/);
  });

  it("refuses a username that is not lowercase", async () => {
    await expect(insertUser("Alice")).rejects.toThrow(/CHECK constraint failed/);
  });

  it("refuses a weekday outside 0–6", async () => {
    const userId = await insertUser("alice");
    const insert = env.DB.prepare(
      "INSERT INTO weekly_rules (user_id, weekday, start_local, end_local) VALUES (?, ?, '09:00', '12:00')",
    );

    await insert.bind(userId, 6).run();
    await expect(insert.bind(userId, 7).run()).rejects.toThrow(/CHECK constraint failed/);
  });

  it("removes a user's rows with the user and keeps the name's history", async () => {
    const userId = await insertUser("alice");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO weekly_rules (user_id, weekday, start_local, end_local) VALUES (?, 1, '09:00', '12:00')",
      ).bind(userId),
      env.DB.prepare(
        "INSERT INTO manual_slots (user_id, start_utc, end_utc) VALUES (?, ?, ?)",
      ).bind(userId, NOW, NOW + 3_600_000),
      env.DB.prepare(
        "INSERT INTO exceptions (user_id, kind, source, start_utc, end_utc, label) VALUES (?, 'block', 'manual', ?, ?, 'Holiday')",
      ).bind(userId, NOW, NOW + 3_600_000),
      env.DB.prepare(
        "INSERT INTO username_history (username, user_id, released_at, held_until) VALUES ('alice-old', ?, ?, ?)",
      ).bind(userId, NOW, NOW),
    ]);

    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

    expect(await count("weekly_rules", userId)).toBe(0);
    expect(await count("manual_slots", userId)).toBe(0);
    expect(await count("exceptions", userId)).toBe(0);
    const history = await env.DB.prepare(
      "SELECT user_id FROM username_history WHERE username = 'alice-old'",
    ).first<{ user_id: number | null }>();
    expect(history).toEqual({ user_id: null });
  });
});
