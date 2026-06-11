import "./load-env";
import { randomUUID } from "node:crypto";

/**
 * Concurrency / no-oversell stress harness (REQUIRED).
 *
 * Fires N concurrent claims at a fresh release through the DSQL connector pool and
 * ASSERTS the fairness invariants, exiting non-zero on any violation:
 *   - allocations granted === min(attempts, capacity);
 *   - oversells === 0 (no shard negative; SUM(remaining) === capacity - allocated);
 *   - every successful claimant is distinct and holds exactly one slot;
 *   - derived ranks are exactly 1..allocated, unique and contiguous.
 *
 * Usage:
 *   npm run stress -- --attempts 3000 --capacity 200 --shardCount 32 --concurrency 64
 *   npm run stress -- --endpoint secondary           # target the peered region
 */

interface Flags {
  attempts: number;
  capacity: number;
  shardCount: number;
  concurrency: number;
  endpoint: "primary" | "secondary";
  mode: "fcfs" | "lottery";
}

function parseFlags(argv: string[]): Flags {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const eq = key.indexOf("=");
      if (eq >= 0) out[key.slice(0, eq)] = key.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[key] = argv[++i];
      else out[key] = "true";
    }
  }
  const endpoint = out.endpoint === "secondary" ? "secondary" : "primary";
  return {
    attempts: Number(out.attempts ?? 3000),
    capacity: Number(out.capacity ?? 200),
    shardCount: Number(out.shardCount ?? 32),
    concurrency: Number(out.concurrency ?? 64),
    endpoint,
    mode: out.mode === "lottery" ? "lottery" : "fcfs",
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function lane() {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => lane()));
}

/**
 * Mode B stress: fires N concurrent ENTERS at a fresh lottery release, then
 * triggers the draw. Asserts (non-zero exit on violation): every entry recorded
 * with zero duplicates; winners === min(attempts, capacity), all distinct
 * entrants; the winner set re-derives BYTE-FOR-BYTE from seed + entry list;
 * a repeat draw is a no-op. Prints entry throughput, latency, OCC retries.
 */
async function runLottery(flags: Flags): Promise<void> {
  const { createProvider, createRelease, getReleaseState } = await import("@/db/releases");
  const {
    insertLotteryConfig,
    insertEntry,
    countEntries,
    listEntryIds,
    winnerEntryIds,
    getLotteryConfigInternal,
  } = await import("@/db/lottery");
  const { generateSeed, deriveWinners, sha256Utf8Hex } = await import("@/domain/lottery");
  const { draw } = await import("@/domain/draw");
  const { query, isConnectionError } = await import("@/db/query");
  const { closePools } = await import("@/db/pool");
  const { isOccConflict } = await import("@/db/retry");

  console.log(
    `\n=== Singleton LOTTERY stress: ${flags.attempts} entries vs capacity ${flags.capacity} ` +
      `across ${flags.shardCount} shards (concurrency ${flags.concurrency}) ===\n`,
  );

  const providerId = await createProvider("Lottery Stress Provider");
  const release = await createRelease({
    providerId,
    title: "Lottery stress release",
    capacity: flags.capacity,
    shardCount: flags.shardCount,
    opensAt: new Date(Date.now() - 1_000),
    status: "open",
  });
  const { seed: createdSeed, seedHash } = generateSeed();
  await insertLotteryConfig(release.id, new Date(Date.now() + 3_600_000), createdSeed, seedHash);

  // ---- Entry burst ----
  const claimants = Array.from({ length: flags.attempts }, (_, i) => `e${i}-${randomUUID()}`);
  const latencies: number[] = [];
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  let entered = 0;
  let errors = 0;
  let occRetries = 0;

  const startedAt = Date.now();
  await runPool(claimants, flags.concurrency, async (claimantId) => {
    const t0 = Date.now();
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await insertEntry(release.id, claimantId);
          entered++;
          break;
        } catch (err) {
          // Both OCC conflicts and connection-level drops are safely retryable:
          // insertEntry is idempotent (unique (release_id, claimant_id) returns
          // the existing row), so a retry after a mid-flight drop cannot dupe.
          if ((isOccConflict(err) || isConnectionError(err)) && attempt < 4) {
            occRetries++;
            await sleep(150 * (attempt + 1));
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        const e = err as { code?: string; message?: string };
        console.error(`  enter error [code=${e?.code ?? "?"}]: ${e?.message ?? String(err)}`);
      }
    } finally {
      latencies.push(Date.now() - t0);
    }
  });
  const entryElapsedMs = Date.now() - startedAt;
  latencies.sort((a, b) => a - b);

  // ---- Close the window (test scaffolding), then draw ----
  await query("UPDATE lottery_config SET entry_closes_at = now() WHERE release_id = $1", [
    release.id,
  ]);
  const drawStarted = Date.now();
  const result = await draw(release.id);
  const drawMs = Date.now() - drawStarted;
  const repeat = await draw(release.id); // must be a no-op

  // ---- Ground truth ----
  const entryCount = await countEntries(release.id);
  const distinctRows = await query<{ n: number }>(
    "SELECT count(DISTINCT claimant_id)::int AS n FROM entries WHERE release_id = $1",
    [release.id],
  );
  const entryIds = await listEntryIds(release.id);
  const winners = await winnerEntryIds(release.id);
  const cfg = await getLotteryConfigInternal(release.id);
  const state = await getReleaseState(release.id);

  const expectedWinners = Math.min(flags.attempts, flags.capacity);
  // Byte-for-byte re-derivation from the revealed seed + the public entry list.
  const rederived =
    cfg && cfg.drawn_at
      ? deriveWinners(cfg.seed, entryIds, flags.capacity)
          .map((w) => w.id)
          .sort()
      : [];
  const rederivesExactly =
    rederived.length === winners.length && rederived.every((id, i) => id === winners[i]);

  // ---- Report ----
  console.log("Entry results:");
  console.log(`  attempts            : ${flags.attempts}`);
  console.log(`  entered             : ${entered}`);
  console.log(`  errors              : ${errors}`);
  console.log(`  OCC retries         : ${occRetries}`);
  console.log(
    `  entry throughput    : ${((flags.attempts / entryElapsedMs) * 1000).toFixed(0)} entries/s (${entryElapsedMs} ms)`,
  );
  console.log(
    `  latency p50/p95/p99 : ${percentile(latencies, 50)} / ${percentile(latencies, 95)} / ${percentile(latencies, 99)} ms`,
  );
  console.log("\nDraw:");
  console.log(`  status              : ${result.status} (${drawMs} ms)`);
  console.log(`  winners             : ${result.winners}  (expected ${expectedWinners})`);
  console.log(`  repeat draw         : ${repeat.status}`);
  console.log("\nGround truth (DB):");
  console.log(`  entry rows          : ${entryCount}  (distinct claimants ${distinctRows[0]?.n})`);
  console.log(`  winner allocations  : ${winners.length}`);
  console.log(`  seed commitment ok  : ${cfg ? sha256Utf8Hex(cfg.seed) === cfg.seed_hash : false}`);
  console.log(`  re-derives exactly  : ${rederivesExactly}`);
  console.log(`  state.remaining     : ${state?.remaining}  status: ${state?.status}`);

  // ---- Assertions ----
  const failures: string[] = [];
  if (errors > 0) failures.push(`${errors} enter(s) errored`);
  if (entryCount !== flags.attempts)
    failures.push(`entry rows ${entryCount} !== attempts ${flags.attempts}`);
  if ((distinctRows[0]?.n ?? 0) !== flags.attempts)
    failures.push(`duplicate entries detected (distinct ${distinctRows[0]?.n})`);
  if (result.status !== "drawn") failures.push(`first draw status ${result.status} !== drawn`);
  if (result.winners !== expectedWinners)
    failures.push(`winners ${result.winners} !== expected ${expectedWinners}`);
  if (winners.length !== expectedWinners)
    failures.push(`winner allocations ${winners.length} !== expected ${expectedWinners}`);
  if (new Set(winners).size !== winners.length) failures.push("winner entry ids not distinct");
  if (!rederivesExactly) failures.push("winner set does NOT re-derive from seed + entries");
  if (repeat.status !== "already_drawn")
    failures.push(`repeat draw status ${repeat.status} !== already_drawn`);
  if (repeat.winners !== expectedWinners)
    failures.push(`repeat draw reports ${repeat.winners} winners (allocations changed?)`);
  if (state?.remaining !== flags.capacity - expectedWinners)
    failures.push(
      `remaining ${state?.remaining} !== capacity - winners ${flags.capacity - expectedWinners}`,
    );

  await closePools();
  if (failures.length > 0) {
    console.error("\n❌ LOTTERY STRESS FAILED:");
    for (const f of failures) console.error("   - " + f);
    process.exit(1);
  }
  console.log(
    "\n✅ LOTTERY STRESS PASSED — all entries recorded, winners exact + distinct, draw re-derivable, repeat no-op.\n",
  );
  process.exit(0);
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  // Size the pool to the requested concurrency BEFORE the pool is first built.
  if (!process.env.DB_POOL_MAX) {
    process.env.DB_POOL_MAX = String(Math.max(flags.concurrency, 5));
  }

  if (flags.mode === "lottery") {
    return runLottery(flags);
  }

  // Import DB modules AFTER setting DB_POOL_MAX so the pool picks it up.
  const { createProvider, createRelease, getReleaseState } = await import("@/db/releases");
  const { claim } = await import("@/domain/claim");
  const { countAllocations, getLedger } = await import("@/db/allocations");
  const { query } = await import("@/db/query");
  const { closePools } = await import("@/db/pool");
  const { deriveRanks, checkContiguousRanks } = await import("@/domain/rank");
  const { isOccConflict } = await import("@/db/retry");

  console.log(
    `\n=== Singleton stress: ${flags.attempts} attempts vs capacity ${flags.capacity} ` +
      `across ${flags.shardCount} shards (concurrency ${flags.concurrency}, endpoint ${flags.endpoint}) ===\n`,
  );

  const providerId = await createProvider("Stress Provider");
  const release = await createRelease({
    providerId,
    title: "Stress release",
    capacity: flags.capacity,
    shardCount: flags.shardCount,
    opensAt: new Date(Date.now() - 1_000),
    status: "open",
  });

  const claimants = Array.from({ length: flags.attempts }, (_, i) => `c${i}-${randomUUID()}`);
  const latencies: number[] = [];
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  let allocated = 0;
  let soldOut = 0;
  let notOpen = 0;
  let errors = 0;
  let retries = 0;
  let clientRetries = 0;

  const startedAt = Date.now();
  await runPool(claimants, flags.concurrency, async (claimantId) => {
    const t0 = Date.now();
    // One idempotency key per claimant, reused across client-level retries —
    // exactly like the browser client, so a retried claim can never double-allocate.
    const idempotencyKey = randomUUID();
    try {
      // Mirror the API contract: when server-side OCC retries are exhausted the
      // claim route returns a retryable 503 and the client retries. The harness
      // does the same (bounded), instead of treating designed backpressure as a
      // hard failure. Non-OCC errors still fail the run.
      let res;
      for (let clientAttempt = 0; ; clientAttempt++) {
        try {
          res = await claim(release.id, claimantId, idempotencyKey, {
            prefer: flags.endpoint,
            onRetry: () => {
              retries++;
            },
          });
          break;
        } catch (err) {
          if (isOccConflict(err) && clientAttempt < 3) {
            clientRetries++;
            await sleep(250 * (clientAttempt + 1));
            continue;
          }
          throw err;
        }
      }
      if (res.status === "allocated") allocated++;
      else if (res.status === "sold_out") soldOut++;
      else notOpen++;
    } catch (err) {
      errors++;
      if (errors <= 5) {
        const e = err as { code?: string; message?: string };
        console.error(`  claim error [code=${e?.code ?? "?"}]: ${e?.message ?? String(err)}`);
      }
    } finally {
      latencies.push(Date.now() - t0);
    }
  });
  const elapsedMs = Date.now() - startedAt;

  latencies.sort((a, b) => a - b);
  const throughput = (flags.attempts / elapsedMs) * 1000;

  // ---- Gather ground truth from the DB ----
  const shards = await query<{ remaining: number }>(
    "SELECT remaining FROM release_shards WHERE release_id = $1",
    [release.id],
    { prefer: flags.endpoint },
  );
  const sumRemaining = shards.reduce((a, s) => a + s.remaining, 0);
  const anyNegative = shards.some((s) => s.remaining < 0);
  const allocationCount = await countAllocations(release.id);
  const distinctRows = await query<{ n: number }>(
    "SELECT count(DISTINCT claimant_id)::int AS n FROM allocations WHERE release_id = $1",
    [release.id],
    { prefer: flags.endpoint },
  );
  const distinctClaimants = distinctRows[0]?.n ?? 0;
  const ledger = await getLedger(release.id);
  const ranks = deriveRanks(ledger.map((l) => ({ id: l.id, claimedAt: l.claimedAt }))).map(
    (x) => x.rank,
  );
  const rankCheck = checkContiguousRanks(ranks);
  const state = await getReleaseState(release.id);

  // ---- Report ----
  const expectedAllocated = Math.min(flags.attempts, flags.capacity);
  console.log("Results:");
  console.log(`  attempts            : ${flags.attempts}`);
  console.log(`  allocated           : ${allocated}  (expected ${expectedAllocated})`);
  console.log(`  sold_out            : ${soldOut}`);
  console.log(`  not_open            : ${notOpen}`);
  console.log(`  errors              : ${errors}`);
  console.log(`  OCC retries         : ${retries}`);
  console.log(`  client retries (503): ${clientRetries}`);
  console.log(`  throughput          : ${throughput.toFixed(0)} claims/s (${elapsedMs} ms)`);
  console.log(
    `  latency p50/p95/p99 : ${percentile(latencies, 50)} / ${percentile(latencies, 95)} / ${percentile(latencies, 99)} ms`,
  );
  console.log("\nGround truth (DB):");
  console.log(`  allocation rows     : ${allocationCount}`);
  console.log(`  distinct claimants  : ${distinctClaimants}`);
  console.log(`  SUM(remaining)      : ${sumRemaining}  (expected ${flags.capacity - allocated})`);
  console.log(`  any shard negative  : ${anyNegative}`);
  console.log(`  ranks 1..N          : ${rankCheck.ok ? "OK" : "FAIL — " + rankCheck.reason}`);
  console.log(`  state.remaining     : ${state?.remaining}`);

  // ---- Assertions ----
  const failures: string[] = [];
  if (allocated !== expectedAllocated)
    failures.push(`allocated ${allocated} !== expected ${expectedAllocated}`);
  if (allocationCount !== expectedAllocated)
    failures.push(`allocation rows ${allocationCount} !== expected ${expectedAllocated}`);
  if (distinctClaimants !== expectedAllocated)
    failures.push(
      `distinct claimants ${distinctClaimants} !== ${expectedAllocated} (a claimant holds >1 slot)`,
    );
  if (anyNegative) failures.push("a shard went negative (OVERSELL)");
  if (sumRemaining !== flags.capacity - allocated)
    failures.push(
      `SUM(remaining) ${sumRemaining} !== capacity - allocated ${flags.capacity - allocated} (OVERSELL)`,
    );
  if (!rankCheck.ok) failures.push(`ranks not 1..N contiguous: ${rankCheck.reason}`);
  if (errors > 0) failures.push(`${errors} claim(s) errored`);

  await closePools();

  if (failures.length > 0) {
    console.error("\n❌ STRESS FAILED:");
    for (const f of failures) console.error("   - " + f);
    process.exit(1);
  }
  console.log(
    "\n✅ STRESS PASSED — oversells: 0, allocations exact, claimants distinct, ranks 1..N.\n",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Stress harness crashed:", err);
  process.exit(1);
});
