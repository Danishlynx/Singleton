import "./load-env";
import { query } from "@/db/query";
import { closePools } from "@/db/pool";

/**
 * Remove test/stress releases (and all their child rows) so the public landing
 * shows only real/showcase releases. Matches by the titles our test tooling uses.
 *
 * DSQL caps a transaction at 3,000 modified rows, and a 10k stress run leaves
 * ~9,800 waitlist rows on one release — so child deletes run in LOOPED BATCHES
 * (DELETE ... WHERE id IN (SELECT ... LIMIT n)), each batch its own transaction.
 *
 *   npx tsx scripts/cleanup-test-data.ts            # delete test-titled releases
 *   npx tsx scripts/cleanup-test-data.ts --dry-run  # list what would go
 */

const TEST_TITLE_PATTERNS = [
  "Stress release",
  "Lottery stress release",
  "E2E %",
  "Integration release",
  "Lottery integration release",
  "MR release",
  "control",
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

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const where = TEST_TITLE_PATTERNS.map((_, i) => `title LIKE $${i + 1}`).join(" OR ");
  const releases = await query<{ id: string; title: string }>(
    `SELECT id, title FROM releases WHERE ${where} ORDER BY created_at`,
    [...TEST_TITLE_PATTERNS],
  );

  if (releases.length === 0) {
    console.log("No test releases found — landing is clean.");
    return;
  }
  console.log(`${dryRun ? "Would delete" : "Deleting"} ${releases.length} test release(s):`);

  for (const rel of releases) {
    if (dryRun) {
      console.log(`  - ${rel.title} (${rel.id})`);
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
    console.log(
      `  - ${rel.title}: allocations ${counts.allocations}, waitlist ${counts.waitlist}, ` +
        `entries ${counts.entries}, shards ${counts.shards}`,
    );
  }
  console.log(dryRun ? "(dry run — nothing deleted)" : "Done.");
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Cleanup failed:", err);
    await closePools();
    process.exit(1);
  });
