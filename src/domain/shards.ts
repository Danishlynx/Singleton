/**
 * Pure shard helpers (no DB, no I/O) — unit-testable.
 *
 * The release capacity is split across `shard_count` rows so that concurrent
 * decrements spread across many keys, keeping Aurora DSQL OCC conflicts on any
 * single row rare (DSQL warns against hot single-row updates).
 */

/**
 * Split `capacity` across `shardCount` shards as evenly as possible, handing the
 * remainder to the first shards. The returned array always sums to `capacity`.
 *
 * e.g. distributeCapacity(200, 32) -> 8 shards of 7 + 24 shards of 6 (= 200).
 */
export function distributeCapacity(capacity: number, shardCount: number): number[] {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error(`capacity must be a positive integer, got ${capacity}`);
  }
  if (!Number.isInteger(shardCount) || shardCount <= 0) {
    throw new Error(`shardCount must be a positive integer, got ${shardCount}`);
  }
  const base = Math.floor(capacity / shardCount);
  let remainder = capacity % shardCount;
  const shards: number[] = [];
  for (let i = 0; i < shardCount; i++) {
    shards.push(base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return shards;
}

/**
 * Fisher–Yates shuffle returning a NEW array (input untouched). The RNG is
 * injectable so tests are deterministic; the claim path uses Math.random to
 * pick a random shard order, spreading contention across claimants.
 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}
