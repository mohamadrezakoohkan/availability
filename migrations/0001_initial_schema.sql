-- Initial schema: the data model in SPEC.md §9.
--
-- Conventions (instructions/database.md):
--   * Instants are INTEGER UTC epoch milliseconds (columns ending in _at, _utc, _until).
--   * Local wall times are TEXT 'HH:MM'; local dates are TEXT 'YYYY-MM-DD'.
--   * A column is NOT NULL unless §9 marks it NULL. No column has a DEFAULT.

CREATE TABLE users (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  username                TEXT NOT NULL CHECK (username = lower(username)),  -- stored lowercase (§3.1)
  display_name            TEXT NOT NULL,
  note                    TEXT NOT NULL,
  avatar_url              TEXT NOT NULL,
  time_zone               TEXT NOT NULL,                    -- IANA zone name
  page_state              TEXT NOT NULL CHECK (page_state IN ('public', 'unlisted', 'paused')),
  horizon_weeks           INTEGER NOT NULL,
  precision_minutes       INTEGER NOT NULL,
  availability_updated_at INTEGER NOT NULL,
  first_published_at      INTEGER,
  state                   TEXT NOT NULL CHECK (state IN ('active', 'suspended')),
  email                   TEXT,
  recovery_hash           TEXT NOT NULL,
  recovery_salt           TEXT NOT NULL,
  recovery_failed_count   INTEGER NOT NULL,
  recovery_locked_until   INTEGER,
  signup_ip_hash          TEXT,                             -- cleared after 30 days (§10)
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  last_renamed_at         INTEGER NOT NULL
);

-- Username uniqueness is enforced here, not by a pre-check (§3.1).
CREATE UNIQUE INDEX users_username_unique ON users (username);

CREATE TABLE contact_links (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,
  url      TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX contact_links_user ON contact_links (user_id);

CREATE TABLE passkeys (
  id           TEXT PRIMARY KEY,                            -- WebAuthn credential id
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  public_key   BLOB NOT NULL,
  counter      INTEGER NOT NULL,
  transports   TEXT NOT NULL,                               -- JSON array
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE INDEX passkeys_user ON passkeys (user_id);

CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  user_agent_hash TEXT NOT NULL
);

CREATE INDEX sessions_user ON sessions (user_id);

-- Weekly rules stay in local wall time so they follow daylight saving (§9).
CREATE TABLE weekly_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sunday
  start_local TEXT NOT NULL,                                -- 'HH:MM'
  end_local   TEXT NOT NULL,                                -- 'HH:MM'; at or before start_local ends the next day
  valid_from  TEXT,                                         -- 'YYYY-MM-DD', inclusive
  valid_until TEXT                                          -- 'YYYY-MM-DD', inclusive
);

CREATE INDEX weekly_rules_user ON weekly_rules (user_id);

CREATE TABLE manual_slots (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  start_utc INTEGER NOT NULL,
  end_utc   INTEGER NOT NULL,
  CHECK (end_utc > start_utc)
);

CREATE INDEX manual_slots_user ON manual_slots (user_id);

CREATE TABLE exceptions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('block')),
  source    TEXT NOT NULL CHECK (source IN ('manual', 'quick')),
  start_utc INTEGER NOT NULL,
  end_utc   INTEGER NOT NULL,
  label     TEXT,                                           -- publisher's own views only, never public
  CHECK (end_utc > start_utc)
);

CREATE INDEX exceptions_user ON exceptions (user_id);

-- Redirects and holds. user_id becomes NULL when the account is deleted.
CREATE TABLE username_history (
  username    TEXT PRIMARY KEY CHECK (username = lower(username)),
  user_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
  released_at INTEGER NOT NULL,
  held_until  INTEGER NOT NULL
);

CREATE INDEX username_history_user ON username_history (user_id);

CREATE TABLE reserved_usernames (
  username   TEXT PRIMARY KEY CHECK (username = lower(username)),
  reason     TEXT NOT NULL,
  created_by INTEGER NOT NULL,                              -- operators.id
  created_at INTEGER NOT NULL
);

CREATE TABLE operators (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  access_email TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX operators_user ON operators (user_id);

CREATE TABLE role_grants (
  operator_id INTEGER NOT NULL REFERENCES operators (id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  granted_by  INTEGER NOT NULL,                             -- operators.id
  granted_at  INTEGER NOT NULL,
  PRIMARY KEY (operator_id, role)
);

CREATE TABLE policies (
  key        TEXT NOT NULL,
  scope      TEXT NOT NULL CHECK (scope IN ('global', 'user')),
  user_id    INTEGER REFERENCES users (id) ON DELETE CASCADE,
  value_json TEXT NOT NULL,
  version    INTEGER NOT NULL,
  updated_by INTEGER NOT NULL,                              -- operators.id
  updated_at INTEGER NOT NULL,
  CHECK ((scope = 'global') = (user_id IS NULL))
);

-- One global value per key, and one override per key and user.
CREATE UNIQUE INDEX policies_global_unique ON policies (key) WHERE scope = 'global';
CREATE UNIQUE INDEX policies_user_unique ON policies (key, user_id) WHERE scope = 'user';
CREATE INDEX policies_user ON policies (user_id);

-- Append-only. Refers to users by internal id and has no foreign key, so
-- entries stay after an account is deleted (§3.4, §6.4).
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_kind  TEXT NOT NULL,
  actor_id    INTEGER NOT NULL,
  action      TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id   TEXT NOT NULL,                                -- user id as text, or a key such as a policy key or reserved name
  before_json TEXT,                                         -- NULL when the target did not exist before
  after_json  TEXT,                                         -- NULL when the target no longer exists
  ip_hash     TEXT,                                         -- cleared after 30 days (§10)
  created_at  INTEGER NOT NULL
);
