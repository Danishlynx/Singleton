import { query, queryOne } from "@/db/query";

/**
 * Vendor branding for releases (additive — see 0005_release_meta.sql). At most one
 * row per release; absent row or NULL fields render the neutral fallback UI.
 */

export interface ReleaseMeta {
  imageUrl: string | null;
  description: string | null;
  venue: string | null;
  eventAt: string | null; // ISO 8601
}

interface MetaRow {
  release_id: string;
  image_url: string | null;
  description: string | null;
  venue: string | null;
  event_at: Date | null;
}

function toMeta(row: MetaRow): ReleaseMeta {
  return {
    imageUrl: row.image_url,
    description: row.description,
    venue: row.venue,
    eventAt: row.event_at ? new Date(row.event_at).toISOString() : null,
  };
}

export async function upsertReleaseMeta(
  releaseId: string,
  meta: { imageUrl?: string; description?: string; venue?: string; eventAt?: Date },
): Promise<void> {
  await query(
    `INSERT INTO release_meta (release_id, image_url, description, venue, event_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (release_id) DO UPDATE
       SET image_url = EXCLUDED.image_url,
           description = EXCLUDED.description,
           venue = EXCLUDED.venue,
           event_at = EXCLUDED.event_at`,
    [
      releaseId,
      meta.imageUrl ?? null,
      meta.description ?? null,
      meta.venue ?? null,
      meta.eventAt ?? null,
    ],
  );
}

export async function getReleaseMeta(releaseId: string): Promise<ReleaseMeta | null> {
  const row = await queryOne<MetaRow>(
    "SELECT release_id, image_url, description, venue, event_at FROM release_meta WHERE release_id = $1",
    [releaseId],
  );
  return row ? toMeta(row) : null;
}

/** Batch lookup for listings (landing page thumbnails) — one IN query. */
export async function getReleaseMetaMap(
  releaseIds: readonly string[],
): Promise<Map<string, ReleaseMeta>> {
  if (releaseIds.length === 0) return new Map();
  const params = releaseIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await query<MetaRow>(
    `SELECT release_id, image_url, description, venue, event_at
       FROM release_meta WHERE release_id IN (${params})`,
    [...releaseIds],
  );
  return new Map(rows.map((r) => [r.release_id, toMeta(r)]));
}
