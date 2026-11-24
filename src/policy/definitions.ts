/**
 * Every platform limit the operator can edit (SPEC.md §6.3): its key, a zod
 * schema for its value and its default. A default written here is the only
 * place a limit's number may appear in code (instructions/policies.md).
 *
 * A new limit is a new entry here; its value is then managed in the
 * backoffice.
 */

import { z } from "zod";

function define<S extends z.ZodType>(schema: S, defaultValue: z.infer<S>) {
  return { schema, default: defaultValue };
}

const count = z.number().int().min(0);
const positive = z.number().int().min(1);

export const policies = {
  "signup.mode": define(z.enum(["open", "invite_only", "closed"]), "open"),
  "signup.max_per_ip_per_day": define(count, 3),
  "signup.unpublished_expiry_days": define(positive, 30),

  "username.min_length": define(positive, 3),
  "username.max_length": define(positive, 30),
  "username.rename_cooldown_days": define(count, 30),
  "username.hold_days": define(count, 90),

  "availability.max_horizon_weeks": define(positive, 12),
  "availability.min_precision_minutes": define(positive, 15),
  "availability.max_rules": define(positive, 50),
  "availability.max_slots": define(positive, 200),
  "availability.max_exceptions": define(positive, 100),

  "ratelimit.public_per_minute": define(positive, 120),

  "recovery.min_length": define(positive, 10),
  "recovery.max_attempts_per_hour": define(positive, 5),

  "cache.public_ttl_seconds": define(count, 60),
} as const;

export type PolicyKey = keyof typeof policies;

export type PolicyValue<K extends PolicyKey> = z.infer<(typeof policies)[K]["schema"]>;
