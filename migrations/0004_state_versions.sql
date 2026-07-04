CREATE TABLE IF NOT EXISTS state_versions (
  household_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO state_versions VALUES ('home', 1, '2026-07-03T00:00:00.000Z');
