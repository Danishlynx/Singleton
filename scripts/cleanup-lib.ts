import { readFileSync } from "node:fs";
import { query } from "@/db/query";

/**
 * Shared deletion logic for test/demo releases. Used by the cleanup CLI
 * (scripts/cleanup-test-data.ts) and by the Playwright global teardown, which
 * sweeps E2E debris automatically after every test run so the public landing
 * never shows posterless "E2E ..." releases.
 *
 * DSQL caps a transaction at 3,000 modified rows, and a 10k stress run leaves
 * ~9,800 waitlist rows on one release — so child deletes run in LOOPED BATCHES
 * (DELETE ... WHERE id IN (SELECT ... LIMIT n)), each batch its own transaction.
 */

/** Titles created by tests and stress tooling. Safe to delete at any time. */
export const TEST_TOOLING_PATTERNS = [
  "Stress release",
  "Lottery stress release",
  "E2E %",
  "Integration release",
  "Lottery integration release",
  "Ownership test release",
  "MR release",
  "control",
];

/** Exact titles of the current showcase, read from the seed's event list. */
function loadShowcaseTitles(): string[] {
  try {
    const raw = readFileSync(new URL("./showcase-events.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as Array<{ title: string }>).map((e) => e.title);
  } catch {
    return [];
  }
}

/** Showcase + legacy demo titles. Deleting these turns the cleanup into a full
 * demo reset before re-seeding. The current showcase titles come straight from
 * scripts/showcase-events.json; the legacy prefixes clear any older seed still
 * in the database. */
export const DEMO_SEED_PATTERNS = [
  "Spring vaccination slots",
  "Midnight Frequencies%",
  "GameDev%",
  "CloudConf%",
  "Free flu vaccination%",
  "Harbour Hackathon%",
  "FF-01%",
  "Puppy adoption%",
  "Chef's table%",
  "Stargazing%",
  "City Marathon%",
  ...loadShowcaseTitles(),
];

const BATCH = 2000; // safely under the 3,000-row per-transaction cap

async function deleteChildrenBatched(table: string, releaseId: string): Promise<number> {
  let total = 0;
  for (;;) {
    const res = await query<{ id: string }>(
      `DELETE FROM ${table} WHERE id IN (
         SELECT id FROM ${table} WHERE release_id = $1 LIMIT ${BATCH}
       ) RETURNING id`,
      [releaseId],
    );
    total += res.length;
    if (res.length < BATCH) return total;
  }
}

export interface CleanupOptions {
  dryRun?: boolean;
  log?: (line: string) => void;
}

/** Delete every release whose title matches one of the LIKE patterns, with all
 * child rows. Returns the number of releases removed. */
export async function deleteReleasesByTitle(
  patterns: string[],
  { dryRun = false, log = console.log }: CleanupOptions = {},
): Promise<number> {
  const where = patterns.map((_, i) => `title LIKE $${i + 1}`).join(" OR ");
  const releases = await query<{ id: string; title: string }>(
    `SELECT id, title FROM releases WHERE ${where} ORDER BY created_at`,
    [...patterns],
  );

  if (releases.length === 0) return 0;
  log(`${dryRun ? "Would delete" : "Deleting"} ${releases.length} test release(s):`);

  for (const rel of releases) {
    if (dryRun) {
      log(`  - ${rel.title} (${rel.id})`);
      continue;
    }
    const counts = {
      allocations: await deleteChildrenBatched("allocations", rel.id),
      waitlist: await deleteChildrenBatched("waitlist", rel.id),
      entries: await deleteChildrenBatched("entries", rel.id),
      shards: await deleteChildrenBatched("release_shards", rel.id),
    };
    await query("DELETE FROM lottery_config WHERE release_id = $1", [rel.id]);
    await query("DELETE FROM release_meta WHERE release_id = $1", [rel.id]);
    await query("DELETE FROM releases WHERE id = $1", [rel.id]);
    log(
      `  - ${rel.title}: allocations ${counts.allocations}, waitlist ${counts.waitlist}, ` +
        `entries ${counts.entries}, shards ${counts.shards}`,
    );
  }
  return releases.length;
}
