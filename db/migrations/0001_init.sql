-- 0001_init.sql — base tables for Singleton (Aurora DSQL).
--
-- DSQL notes (verified against the Aurora DSQL User Guide, 2026-06):
--   * Each statement below is executed in its OWN transaction by scripts/migrate.ts.
--     DSQL allows only one DDL statement per transaction and forbids mixing DDL + DML.
--   * NO FOREIGN KEYS: DSQL has no FK/REFERENCES support. Relationships (e.g.
--     releases.provider_id -> providers.id) are enforced in the application layer.
--   * CHECK constraints ARE supported on DSQL (column- and table-level) and are kept
--     here as real DB-enforced invariants. See create-table-syntax-support.html.
--   * UUID primary keys are supplied by the app (crypto.randomUUID()); we do not rely
--     on a DB DEFAULT. SPEC-NOTE: DEFAULT gen_random_uuid() is available on DSQL
--     (built-in, no extension) if ever wanted, but app-generated IDs let the claim
--     path know the allocation id up front for idempotency + receipts.
--   * `schema_migrations` is bootstrapped by scripts/migrate.ts (CREATE IF NOT EXISTS)
--     before any migration file runs, so it is intentionally NOT created here.

CREATE TABLE IF NOT EXISTS providers (
  id         uuid PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS releases (
  id          uuid PRIMARY KEY,
  provider_id uuid NOT NULL,                                   -- app-enforced -> providers.id
  title       text NOT NULL,
  capacity    integer NOT NULL CHECK (capacity > 0),
  shard_count integer NOT NULL CHECK (shard_count > 0),        -- e.g. 32
  opens_at    timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled', 'open', 'closed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- capacity is split across shard_count rows; SUM(remaining) = remaining capacity.
-- Sharding spreads the hot-counter writes across many keys so OCC conflicts on any
-- single row stay rare (DSQL warns against frequent single-row updates).
CREATE TABLE IF NOT EXISTS release_shards (
  id          uuid PRIMARY KEY,
  release_id  uuid NOT NULL,                                   -- app-enforced -> releases.id
  shard_index integer NOT NULL,
  remaining   integer NOT NULL CHECK (remaining >= 0)
);

CREATE TABLE IF NOT EXISTS allocations (
  id              uuid PRIMARY KEY,
  release_id      uuid NOT NULL,                               -- app-enforced -> releases.id
  claimant_id     text NOT NULL,                               -- email or stable session id
  shard_id        uuid NOT NULL,                               -- app-enforced -> release_shards.id
  idempotency_key text NOT NULL,
  claimed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
  id          uuid PRIMARY KEY,
  release_id  uuid NOT NULL,                                   -- app-enforced -> releases.id
  claimant_id text NOT NULL,
  joined_at   timestamptz NOT NULL DEFAULT now()
);
