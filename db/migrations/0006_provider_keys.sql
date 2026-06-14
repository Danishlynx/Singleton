-- 0006_provider_keys.sql — per-tenant ownership. ADDITIVE ONLY.
--
-- Each provider (operator/company) gets a secret api_key. A provider authenticates
-- with that key and may then create releases owned by them and delete ONLY their
-- own releases. The platform ADMIN_TOKEN remains a super-admin over everything.
--
-- The column is nullable: existing/seed providers have no key (they are
-- platform-owned demo data, deletable only by the super-admin). New providers
-- registered through /api/providers receive a key.
--
-- One DDL per statement (DSQL rule); the unique index is built ASYNC and the
-- migrate runner polls pg_index.indisvalid before continuing.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS api_key text;

CREATE UNIQUE INDEX ASYNC IF NOT EXISTS providers_api_key_idx
  ON providers (api_key);
