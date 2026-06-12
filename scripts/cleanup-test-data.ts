import "./load-env";
import { closePools } from "@/db/pool";
import {
  deleteReleasesByTitle,
  DEMO_SEED_PATTERNS,
  TEST_TOOLING_PATTERNS,
} from "./cleanup-lib";

/**
 * Remove test/stress releases (and all their child rows) so the public landing
 * shows only real/showcase releases. Matches by the titles our test tooling uses.
 *
 *   npx tsx scripts/cleanup-test-data.ts               # full reset: tests + showcase
 *   npx tsx scripts/cleanup-test-data.ts --tests-only  # keep the showcase
 *   npx tsx scripts/cleanup-test-data.ts --dry-run     # list what would go
 *
 * Note: Playwright E2E runs sweep their own "E2E ..." releases via the global
 * teardown (tests/e2e/global-teardown.ts); this CLI covers stress runs and the
 * full demo reset before scripts/seed-showcase.ts.
 */

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const testsOnly = process.argv.includes("--tests-only");
  const patterns = testsOnly
    ? TEST_TOOLING_PATTERNS
    : [...TEST_TOOLING_PATTERNS, ...DEMO_SEED_PATTERNS];

  const removed = await deleteReleasesByTitle(patterns, { dryRun });
  if (removed === 0) {
    console.log("No test releases found — landing is clean.");
    return;
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
