import { type PolicyKey, type PolicyValue, policies } from "./definitions";

interface StoredPolicy {
  scope: "global" | "user";
  value_json: string;
}

/**
 * The effective value of a platform limit (SPEC.md §6.3): the user's override,
 * else the global value, else the default in code.
 *
 * A stored value that is not JSON or does not match the key's schema is
 * skipped, so one bad edit in the backoffice cannot take a limit away: the
 * next level applies instead.
 */
export async function policy<K extends PolicyKey>(
  db: D1Database,
  key: K,
  userId?: number,
): Promise<PolicyValue<K>> {
  const { results } = await db
    .prepare(
      `SELECT scope, value_json FROM policies
       WHERE key = ? AND (scope = 'global' OR (scope = 'user' AND user_id = ?))`,
    )
    .bind(key, userId ?? null)
    .all<StoredPolicy>();

  const definition = policies[key];
  for (const scope of ["user", "global"] as const) {
    const row = results.find((candidate) => candidate.scope === scope);
    if (!row) continue;

    const value = parseStored(row.value_json, definition.schema);
    if (value.ok) return value.data as PolicyValue<K>;
    console.warn(`Ignoring invalid ${scope} value for policy ${key}`);
  }
  return definition.default as PolicyValue<K>;
}

function parseStored(
  json: string,
  schema: (typeof policies)[PolicyKey]["schema"],
): { ok: true; data: unknown } | { ok: false } {
  try {
    const parsed = schema.safeParse(JSON.parse(json));
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}
