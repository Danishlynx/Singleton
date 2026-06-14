-- 0007_release_category.sql — optional category tag for releases. ADDITIVE ONLY.
-- Stored on the existing branding row (release_meta); nullable, so releases
-- without a category simply don't match category filters. The value is a slug
-- from src/lib/categories.ts (validated by Zod at the API).

ALTER TABLE release_meta ADD COLUMN IF NOT EXISTS category text;
