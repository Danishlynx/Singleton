import { randomUUID } from "node:crypto";
import { withConnection } from "@/db/query";
import { withRetry } from "@/db/retry";
import { deriveWinners, planShardConsumption, assignShards } from "@/domain/lottery";
import { getLotteryConfigInternal } from "@/db/lottery";

export class DrawError extends Error {
  constructor(
    public code: "not_lottery" | "window_open" | "invariant",
    message: string,
  ) {
    super(message);
    this.name = "DrawError";
  }
}

export type DrawResult =
  | { status: "drawn"; winners: number; entrants: number; drawnAt: string }
  | { status: "already_drawn"; winners: number; entrants: number; drawnAt: string };

/**
 * The §7 draw — ONE atomic transaction, idempotent via the drawn_at guard,
 * retried as a whole on OCC conflicts (SQLSTATE 40001).
 *
 * Inside a single BEGIN/COMMIT (one REPEATABLE READ snapshot):
 *   read config (guards) → read entries → derive winners from the committed seed
 *   → consume shards (conditional decrements) → insert winner allocations with
 *   idempotency_key 'draw:'+entryId → set drawn_at → close the release.
 *
 * Consuming the shards keeps the global invariant SUM(remaining) = capacity −
 * allocated true for BOTH modes, so every existing invariant check still holds.
 * Rows modified ≈ winners + consumed shards + 2 — far under DSQL's 3,000-row cap
 * at demo scale (200 + 32 + 2).
 *
 * SECURITY: no error or log line in this path may embed the seed.
 */
export async function draw(releaseId: string): Promise<DrawResult> {
  // Fast path (no transaction): already drawn → idempotent summary.
  const pre = await getLotteryConfigInternal(releaseId);
  if (!pre) throw new DrawError("not_lottery", `release ${releaseId} is not a lottery`);
  if (pre.drawn_at) return drawnSummary(releaseId, pre.drawn_at);
  if (new Date(pre.entry_closes_at).getTime() > Date.now()) {
    throw new DrawError("window_open", "entry window has not closed yet");
  }

  return withRetry(async () =>
    withConnection<DrawResult>(async (client) => {
      await client.query("BEGIN");
      try {
        const cfgRes = await client.query<{
          entry_closes_at: Date;
          seed: string;
          drawn_at: Date | null;
        }>(
          "SELECT entry_closes_at, seed, drawn_at FROM lottery_config WHERE release_id = $1",
          [releaseId],
        );
        const cfg = cfgRes.rows[0];
        if (!cfg) throw new DrawError("not_lottery", "lottery_config row disappeared");
        if (cfg.drawn_at) {
          // Another draw won the race — idempotent no-op.
          await client.query("ROLLBACK");
          return drawnSummary(releaseId, cfg.drawn_at);
        }
        if (new Date(cfg.entry_closes_at).getTime() > Date.now()) {
          throw new DrawError("window_open", "entry window has not closed yet");
        }

        const relRes = await client.query<{ capacity: number }>(
          "SELECT capacity FROM releases WHERE id = $1",
          [releaseId],
        );
        const capacity = relRes.rows[0]?.capacity;
        if (!capacity) throw new DrawError("invariant", "release row missing");

        const entriesRes = await client.query<{ id: string; claimant_id: string }>(
          "SELECT id, claimant_id FROM entries WHERE release_id = $1",
          [releaseId],
        );
        const entries = entriesRes.rows;
        const claimantByEntry = new Map(entries.map((e) => [e.id, e.claimant_id]));

        // Winner set = pure function of (seed, entry ids) — §4 derivation.
        const winners = deriveWinners(
          cfg.seed,
          entries.map((e) => e.id),
          capacity,
        );

        // Plan + execute shard consumption from this snapshot's stock.
        const shardsRes = await client.query<{
          id: string;
          shard_index: number;
          remaining: number;
        }>(
          "SELECT id, shard_index, remaining FROM release_shards WHERE release_id = $1 ORDER BY shard_index",
          [releaseId],
        );
        const plan = planShardConsumption(shardsRes.rows, winners.length);
        const shardForWinner = assignShards(plan, winners.length);

        for (const { shardId, take } of plan) {
          const upd = await client.query(
            `UPDATE release_shards SET remaining = remaining - $2
              WHERE id = $1 AND remaining >= $2`,
            [shardId, take],
          );
          if (upd.rowCount !== 1) {
            // Stock moved under us within our own snapshot — impossible unless a
            // bug; surface loudly (a racing committed writer shows up as 40001).
            throw new DrawError("invariant", `shard consumption failed for shard ${shardId}`);
          }
        }

        // One multi-VALUES insert for all winners (≤ capacity rows, well under caps).
        if (winners.length > 0) {
          const tuples: string[] = [];
          const params: unknown[] = [];
          winners.forEach((w, i) => {
            const b = i * 5;
            tuples.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`);
            params.push(
              randomUUID(),
              releaseId,
              claimantByEntry.get(w.id),
              shardForWinner[i],
              `draw:${w.id}`,
            );
          });
          await client.query(
            `INSERT INTO allocations (id, release_id, claimant_id, shard_id, idempotency_key)
             VALUES ${tuples.join(", ")}`,
            params,
          );
        }

        const mark = await client.query(
          "UPDATE lottery_config SET drawn_at = now() WHERE release_id = $1 AND drawn_at IS NULL",
          [releaseId],
        );
        if (mark.rowCount !== 1) {
          // A concurrent draw won the race (its commit made drawn_at visible).
          // This is the idempotency contract working, not a failure: discard our
          // work and report the committed draw.
          await client.query("ROLLBACK").catch(() => undefined);
          const current = await getLotteryConfigInternal(releaseId);
          if (current?.drawn_at) return drawnSummary(releaseId, current.drawn_at);
          throw new DrawError("invariant", "drawn_at idempotency guard failed");
        }
        const close = await client.query(
          "UPDATE releases SET status = 'closed' WHERE id = $1",
          [releaseId],
        );
        if (close.rowCount !== 1) {
          throw new DrawError("invariant", "failed to close the release");
        }

        await client.query("COMMIT");
        return {
          status: "drawn",
          winners: winners.length,
          entrants: entries.length,
          drawnAt: new Date().toISOString(),
        };
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err; // OCC (40001) bubbles to withRetry; DrawError propagates
      }
    }),
  );
}

async function drawnSummary(releaseId: string, drawnAt: Date): Promise<DrawResult> {
  const { countEntries, winnerEntryIds } = await import("@/db/lottery");
  const [entrants, winners] = await Promise.all([
    countEntries(releaseId),
    winnerEntryIds(releaseId),
  ]);
  return {
    status: "already_drawn",
    winners: winners.length,
    entrants,
    drawnAt: new Date(drawnAt).toISOString(),
  };
}
