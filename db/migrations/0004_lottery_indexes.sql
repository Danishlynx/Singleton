-- 0004_lottery_indexes.sql — lottery indexes (ASYNC; the migrate runner waits for
-- each to become valid before continuing).

-- One entry per claimant per release => idempotent enter, no double entries.
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS uq_entries_release_claimant ON entries (release_id, claimant_id);

-- Entry listing / counting for the live entrant count and the draw.
CREATE INDEX ASYNC IF NOT EXISTS idx_entries_release ON entries (release_id);
