import { createHash, randomBytes } from "node:crypto";

/**
 * Mode B (windowed lottery) — pure domain logic. LOCKED hash formats (§4):
 *
 *   seed       = crypto.randomBytes(32).toString('hex')        // 64 lowercase hex chars
 *   seed_hash  = sha256utf8(seed)                              // hash the hex STRING
 *   score(e)   = sha256utf8(`${seed}:${entryId}`)              // entryId = canonical lowercase uuid
 *   winners    = sort entries by (score ASC, entryId ASC), take capacity
 *
 * All hashing is app code (DSQL has no pgcrypto). The browser (src/lib/sha256.ts)
 * must reproduce these byte-for-byte — pinned by the parity fixture unit test.
 *
 * SECURITY: the seed must never appear in logs or error messages; nothing in this
 * module logs or throws with the seed embedded.
 */

/** sha256 over the UTF-8 bytes of `input`, as lowercase hex. */
export function sha256Utf8Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** New 64-char lowercase-hex seed + its public commitment hash. */
export function generateSeed(): { seed: string; seedHash: string } {
  const seed = randomBytes(32).toString("hex");
  return { seed, seedHash: sha256Utf8Hex(seed) };
}

/** The §4 entry score: sha256utf8(`${seed}:${entryId}`). */
export function entryScore(seed: string, entryId: string): string {
  return sha256Utf8Hex(`${seed}:${entryId}`);
}

export interface ScoredEntry {
  id: string;
  score: string;
}

/**
 * Deterministic winner derivation: score every entry, sort by (score asc, id asc),
 * take the first `capacity`. Pure function of (seed, entryIds) — the whole fairness
 * proof rests on anyone being able to recompute this.
 */
export function deriveWinners(
  seed: string,
  entryIds: readonly string[],
  capacity: number,
): ScoredEntry[] {
  return entryIds
    .map((id) => ({ id, score: entryScore(seed, id) }))
    .sort((a, b) => {
      if (a.score < b.score) return -1;
      if (a.score > b.score) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    })
    .slice(0, capacity);
}

export interface ShardStock {
  id: string;
  shard_index: number;
  remaining: number;
}

export interface ShardTake {
  shardId: string;
  take: number;
}

/**
 * Plan per-shard consumption for `winnerCount` allocations: walk shards in
 * shard_index order, draining each before moving on. Throws if total stock is
 * insufficient (cannot happen when winners = min(capacity, entrants) and the
 * shards were never consumed, but the draw transaction re-checks via rowcounts).
 */
export function planShardConsumption(
  shards: readonly ShardStock[],
  winnerCount: number,
): ShardTake[] {
  const ordered = [...shards].sort((a, b) => a.shard_index - b.shard_index);
  const plan: ShardTake[] = [];
  let needed = winnerCount;
  for (const shard of ordered) {
    if (needed <= 0) break;
    const take = Math.min(shard.remaining, needed);
    if (take > 0) {
      plan.push({ shardId: shard.id, take });
      needed -= take;
    }
  }
  if (needed > 0) {
    throw new Error(
      `insufficient shard stock: short by ${needed} of ${winnerCount} winners`,
    );
  }
  return plan;
}

/**
 * Expand a consumption plan into one shard id per winner (winner i gets
 * assignments[i]). Length always equals winnerCount.
 */
export function assignShards(plan: readonly ShardTake[], winnerCount: number): string[] {
  const assignments: string[] = [];
  for (const { shardId, take } of plan) {
    for (let i = 0; i < take; i++) assignments.push(shardId);
  }
  if (assignments.length !== winnerCount) {
    throw new Error(
      `shard plan covers ${assignments.length} winners, expected ${winnerCount}`,
    );
  }
  return assignments;
}
