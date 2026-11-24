/**
 * Username rules (SPEC.md §3.1). Pure: the lengths come from the
 * `username.min_length` and `username.max_length` policies, read by the caller.
 */

export interface LengthLimits {
  min: number;
  max: number;
}

export type InvalidReason = "too_short" | "too_long" | "characters" | "shape";

export type Validation = { ok: true; username: string } | { ok: false; reason: InvalidReason };

/**
 * Names that are routes of this app, or that §3.1 reserves outright. The
 * operator's `reserved_usernames` list adds to these and cannot remove them.
 */
export const BUILT_IN_RESERVED: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "www",
  "help",
  "mcp",
  "signup",
  "recover",
  "busy",
]);

/**
 * Checks a typed name and returns it in its stored form: lowercase.
 *
 * The characters are checked before lowercasing. Some non-ASCII characters
 * lowercase to ASCII (the Kelvin sign `K` becomes `k`), which would let a
 * look-alike pass, and §3.1 allows ASCII only.
 */
export function validateUsername(input: string, limits: LengthLimits): Validation {
  if (!/^[A-Za-z0-9-]+$/.test(input)) return { ok: false, reason: "characters" };

  const username = input.toLowerCase();
  if (username.length < limits.min) return { ok: false, reason: "too_short" };
  if (username.length > limits.max) return { ok: false, reason: "too_long" };
  if (username.startsWith("-") || username.endsWith("-") || username.includes("--")) {
    return { ok: false, reason: "shape" };
  }
  return { ok: true, username };
}
