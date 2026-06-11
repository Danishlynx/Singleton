-- 0002_indexes.sql — indexes for Singleton (Aurora DSQL).
--
-- DSQL creates indexes ASYNCHRONOUSLY: `CREATE INDEX ASYNC ...` returns immediately
-- with a background job; the index is not enforceable until it becomes VALID.
-- scripts/migrate.ts issues each statement and then polls pg_index.indisvalid (and
-- sys.jobs) until the index is valid before recording the migration as applied.
-- A failed unique build leaves an INVALID index that still rejects duplicate DML,
-- so the runner surfaces an error on failure rather than silently passing.
--
-- Each statement runs in its own transaction (one DDL per transaction on DSQL).

-- Lookups
CREATE INDEX ASYNC IF NOT EXISTS idx_releases_provider ON releases (provider_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_shards_release ON release_shards (release_id);

-- One shard row per (release, shard_index)
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS uq_shards_release_idx ON release_shards (release_id, shard_index);

-- One slot per claimant per release => makes claim idempotent, blocks line-jumping/dupes
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS uq_alloc_release_claimant ON allocations (release_id, claimant_id);

-- Idempotency: a retried claim with the same key can never create a second allocation
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS uq_alloc_idem ON allocations (idempotency_key);

-- Stable first-come ordering for receipts / verification (rank derived from this order)
CREATE INDEX ASYNC IF NOT EXISTS idx_alloc_release_order ON allocations (release_id, claimed_at, id);

-- One waitlist entry per claimant per release
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS uq_waitlist_release_claimant ON waitlist (release_id, claimant_id);
