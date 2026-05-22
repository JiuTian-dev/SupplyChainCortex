-- Cache Backend: PostgreSQL UNLOGGED table
-- Survives process restarts but not DB crashes (acceptable for cache data).
-- UNLOGGED = no WAL overhead, faster writes.

CREATE UNLOGGED TABLE IF NOT EXISTS cache_entries (
  key        TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  hit_count  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries (expires_at);
