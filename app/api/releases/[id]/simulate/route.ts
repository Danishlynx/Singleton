import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { claim } from "@/domain/claim";
import { getRelease, getReleaseState } from "@/db/releases";
import { countAllocations, getLedger } from "@/db/allocations";
import { withConnection } from "@/db/query";
import { deriveRanks, checkContiguousRanks } from "@/domain/rank";
import { isAdminRequest } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // burst can run a while; well under DSQL's 5-min txn cap (per-txn)

const Body = z.object({
  attempts: z.coerce.number().int().positive().max(2000).default(500),
  concurrency: z.coerce.number().int().positive().max(100).default(50),
});

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function lane() {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => lane()));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // The burst is a stress/demo amplifier (up to 2000 claims × 100 concurrency), not
  // an operator feature — restrict it to the platform admin so a self-registered
  // operator key can't turn it into a write-amplification DoS on the cluster.
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const release = await getRelease(id);
  if (!release) return NextResponse.json({ error: "release not found" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { attempts, concurrency } = parsed.data;

  const before = await countAllocations(id);

  const latencies: number[] = [];
  let soldOut = 0;
  let notOpen = 0;
  let errors = 0;
  let retries = 0;

  const claimants = Array.from({ length: attempts }, (_, i) => `sim-${i}-${randomUUID()}`);
  const startedAt = Date.now();
  await runPool(claimants, concurrency, async (claimantId) => {
    const t0 = Date.now();
    try {
      const res = await claim(id, claimantId, randomUUID(), {
        onRetry: () => {
          retries++;
        },
      });
      if (res.status === "sold_out") soldOut++;
      else if (res.status === "not_open") notOpen++;
    } catch {
      errors++;
    } finally {
      latencies.push(Date.now() - t0);
    }
  });
  const elapsedMs = Date.now() - startedAt;
  latencies.sort((a, b) => a - b);

  // Ground truth + invariant checks. Read the allocation count and the shard
  // remainders in ONE transaction so they share a single snapshot — DSQL is
  // REPEATABLE READ, so separate reads could diverge if a claim commits between
  // them and produce a spurious invariant failure.
  const { after, sumRemaining, anyNegative } = await withConnection(async (client) => {
    await client.query("BEGIN");
    try {
      const countRes = await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM allocations WHERE release_id = $1",
        [id],
      );
      const shardsRes = await client.query<{ remaining: number }>(
        "SELECT remaining FROM release_shards WHERE release_id = $1",
        [id],
      );
      await client.query("COMMIT");
      const shards = shardsRes.rows;
      return {
        after: countRes.rows[0]?.n ?? 0,
        sumRemaining: shards.reduce((acc, s) => acc + s.remaining, 0),
        anyNegative: shards.some((s) => s.remaining < 0),
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  });
  const ledger = await getLedger(id);
  const ranks = deriveRanks(ledger.map((l) => ({ id: l.id, claimedAt: l.claimedAt }))).map(
    (x) => x.rank,
  );
  const rankCheck = checkContiguousRanks(ranks);
  const state = await getReleaseState(id);

  const oversells = Math.max(0, after - release.capacity);
  const invariantOk =
    !anyNegative && oversells === 0 && sumRemaining === release.capacity - after && rankCheck.ok;

  return NextResponse.json({
    releaseId: id,
    capacity: release.capacity,
    shardCount: release.shard_count,
    attempts,
    concurrency,
    newlyAllocated: after - before,
    totalAllocated: after,
    soldOut,
    notOpen,
    errors,
    retries,
    oversells,
    remaining: state?.remaining ?? sumRemaining,
    elapsedMs,
    throughputPerSec: elapsedMs > 0 ? Math.round((attempts / elapsedMs) * 1000) : 0,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    },
    ranksContiguous: rankCheck.ok,
    invariantOk,
  });
}
