-- 0005_release_meta.sql — vendor branding for releases. ADDITIVE ONLY: no existing
-- table is altered. A release may have at most one meta row (PK = release_id,
-- app-enforced 1:1 with releases.id — DSQL has no FKs). All fields optional:
-- a release without a row (or with NULL fields) renders the neutral fallback.

CREATE TABLE IF NOT EXISTS release_meta (
  release_id  uuid PRIMARY KEY,      -- 1:1 with releases.id (app-enforced)
  image_url   text,                  -- https poster/banner URL (validated by Zod at the API)
  description text,                  -- short vendor blurb shown on the intake page
  venue       text,                  -- e.g. "Wankhede Stadium, Mumbai"
  event_at    timestamptz            -- when the event itself happens (not the drop)
);
