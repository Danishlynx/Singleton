import { closePools } from "../../src/db/pool";
import { deleteReleasesByTitle, TEST_TOOLING_PATTERNS } from "../../scripts/cleanup-lib";

/**
 * Runs once after every Playwright run: delete the "E2E ..." releases the specs
 * created so the public landing never shows posterless test debris. The specs
 * write through the real admin API into the live cluster, so this is the only
 * place that reliably sees ALL of them regardless of pass/fail/retry.
 *
 * Deliberately limited to TEST_TOOLING_PATTERNS — the curated showcase
 * (scripts/seed-showcase.ts) survives test runs untouched.
 */
export default async function globalTeardown(): Promise<void> {
  // playwright.config.ts already loaded .env.local, so DB creds are present.
  const removed = await deleteReleasesByTitle(TEST_TOOLING_PATTERNS, {
    log: (line) => console.log(`[teardown] ${line}`),
  });
  console.log(
    removed === 0
      ? "[teardown] no test releases to sweep"
      : `[teardown] swept ${removed} test release(s); landing is clean`,
  );
  await closePools();
}
