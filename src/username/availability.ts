import { policy } from "../policy/policy";
import { BUILT_IN_RESERVED, type InvalidReason, validateUsername } from "./rules";

export type UsernameStatus =
  | { status: "available"; username: string }
  | { status: "taken"; username: string }
  | { status: "reserved"; username: string }
  | { status: "invalid"; reason: InvalidReason };

/**
 * Whether a name can be claimed right now. This is the hint for the sign-up
 * form only: the unique index on `users.username` is what decides when two
 * sign-ups race (SPEC.md §3.1).
 *
 * A name is "taken" if a user has it or if it is held after a rename or a
 * deletion (`username_history.held_until` is still in the future).
 */
export async function checkUsername(
  db: D1Database,
  input: string,
  now: number,
): Promise<UsernameStatus> {
  const [min, max] = await Promise.all([
    policy(db, "username.min_length"),
    policy(db, "username.max_length"),
  ]);
  const checked = validateUsername(input, { min, max });
  if (!checked.ok) return { status: "invalid", reason: checked.reason };
  const { username } = checked;

  if (BUILT_IN_RESERVED.has(username)) return { status: "reserved", username };

  const row = await db
    .prepare(
      `SELECT
         EXISTS (SELECT 1 FROM reserved_usernames WHERE username = ?1) AS reserved,
         EXISTS (SELECT 1 FROM users WHERE username = ?1) AS in_use,
         EXISTS (SELECT 1 FROM username_history WHERE username = ?1 AND held_until > ?2) AS held`,
    )
    .bind(username, now)
    .first<{ reserved: number; in_use: number; held: number }>();

  if (row?.reserved) return { status: "reserved", username };
  if (row?.in_use || row?.held) return { status: "taken", username };
  return { status: "available", username };
}
