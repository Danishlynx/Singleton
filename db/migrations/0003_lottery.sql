-- 0003_lottery.sql — Mode B (windowed lottery, commit-reveal draw). ADDITIVE ONLY:
-- no existing table is altered; a release is lottery mode iff a lottery_config row
-- exists for it (app-enforced 1:1 with releases.id — DSQL has no FKs).
--
-- Each statement runs in its own transaction (one DDL per txn on DSQL).

CREATE TABLE IF NOT EXISTS lottery_config (
  release_id      uuid PRIMARY KEY,      -- 1:1 with releases.id (app-enforced)
  entry_closes_at timestamptz NOT NULL,  -- window close = draw time
  seed_hash       text NOT NULL,         -- sha256 of the seed string; public from creation
  seed            text NOT NULL,         -- 64-char lowercase hex; NEVER exposed until drawn_at set
  drawn_at        timestamptz            -- NULL until the draw has run (idempotency guard)
);
-- SPEC-NOTE: production would hold the unrevealed seed in a secrets manager; on-row
-- storage is acceptable for this build. The seed must never appear in logs or errors.

CREATE TABLE IF NOT EXISTS entries (
  id          uuid PRIMARY KEY,          -- app-generated; PUBLIC in draw proofs
  release_id  uuid NOT NULL,             -- app-enforced -> releases.id
  claimant_id text NOT NULL,             -- NEVER exposed in draw proofs (may be an email)
  entered_at  timestamptz NOT NULL DEFAULT now()
);
