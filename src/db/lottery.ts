import { randomUUID } from "node:crypto";
import { query, queryOne } from "@/db/query";
import { isUniqueViolation } from "@/db/allocations";

/**
 * Mode B data access. A release is lottery mode iff a lottery_config row exists
 * (no schema change to releases). The seed is SECRET until drawn_at is set —
 * only getLotteryConfigInternal returns it, and nothing here logs it.
 */

export interface LotteryConfigInternal {
  release_id: string;
  entry_closes_at: Date;
  seed_hash: string;
  seed: string; // SECRET pre-draw — never serialize into API payloads/logs
  drawn_at: Date | null;
}

/** Public-safe lottery state (no seed unless drawn — and even then, callers decide). */
export interface LotteryPublicState {
  entryClosesAt: string; // ISO 8601
  seedHash: string;
  drawnAt: string | null;
}

export type ReleaseMode = "lottery" | "fcfs";

export async function getMode(releaseId: string): Promise<ReleaseMode> {
  const row = await queryOne<{ release_id: string }>(
    "SELECT release_id FROM lottery_config WHERE release_id = $1",
    [releaseId],
  );
  return row ? "lottery" : "fcfs";
}

export async function insertLotteryConfig(
  releaseId: string,
  entryClosesAt: Date,
  seed: string,
  seedHash: string,
): Promise<void> {
  await query(
    `INSERT INTO lottery_config (release_id, entry_closes_at, seed_hash, seed)
     VALUES ($1, $2, $3, $4)`,
    [releaseId, entryClosesAt, seedHash, seed],
  );
}

/** INTERNAL: includes the secret seed. Use getPublicLotteryState for API surfaces. */
export async function getLotteryConfigInternal(
  releaseId: string,
): Promise<LotteryConfigInternal | undefined> {
  return queryOne<LotteryConfigInternal>(
    `SELECT release_id, entry_closes_at, seed_hash, seed, drawn_at
       FROM lottery_config WHERE release_id = $1`,
    [releaseId],
  );
}

export async function getPublicLotteryState(
  releaseId: string,
): Promise<LotteryPublicState | undefined> {
  const row = await queryOne<{ entry_closes_at: Date; seed_hash: string; drawn_at: Date | null }>(
    "SELECT entry_closes_at, seed_hash, drawn_at FROM lottery_config WHERE release_id = $1",
    [releaseId],
  );
  if (!row) return undefined;
  return {
    entryClosesAt: new Date(row.entry_closes_at).toISOString(),
    seedHash: row.seed_hash,
    drawnAt: row.drawn_at ? new Date(row.drawn_at).toISOString() : null,
  };
}

export interface Entry {
  id: string;
  release_id: string;
  claimant_id: string;
  entered_at: Date;
}

export async function findEntry(
  releaseId: string,
  claimantId: string,
): Promise<Entry | undefined> {
  return queryOne<Entry>(
    "SELECT id, release_id, claimant_id, entered_at FROM entries WHERE release_id = $1 AND claimant_id = $2",
    [releaseId, claimantId],
  );
}

/**
 * Idempotent enter: insert a new entry; on the (release_id, claimant_id) unique
 * violation return the existing one. Random-UUID inserts barely contend under
 * OCC, so this needs no sharding even at burst scale.
 */
export async function insertEntry(
  releaseId: string,
  claimantId: string,
): Promise<{ entry: Entry; alreadyEntered: boolean }> {
  const id = randomUUID();
  try {
    const rows = await query<Entry>(
      `INSERT INTO entries (id, release_id, claimant_id)
       VALUES ($1, $2, $3)
       RETURNING id, release_id, claimant_id, entered_at`,
      [id, releaseId, claimantId],
    );
    return { entry: rows[0], alreadyEntered: false };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await findEntry(releaseId, claimantId);
      if (existing) return { entry: existing, alreadyEntered: true };
    }
    throw err;
  }
}

export async function countEntries(releaseId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT count(*)::int AS n FROM entries WHERE release_id = $1",
    [releaseId],
  );
  return row?.n ?? 0;
}

/** All entry ids for a release, sorted ascending — the canonical public proof order. */
export async function listEntryIds(releaseId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    "SELECT id FROM entries WHERE release_id = $1 ORDER BY id",
    [releaseId],
  );
  return rows.map((r) => r.id);
}

/**
 * Winner entry ids recovered from allocations: draw allocations carry
 * idempotency_key = 'draw:' + entryId. Sorted ascending. Never exposes claimant_id.
 */
export async function winnerEntryIds(releaseId: string): Promise<string[]> {
  const rows = await query<{ idempotency_key: string }>(
    `SELECT idempotency_key FROM allocations
      WHERE release_id = $1 AND idempotency_key LIKE 'draw:%'
      ORDER BY idempotency_key`,
    [releaseId],
  );
  return rows.map((r) => r.idempotency_key.slice("draw:".length)).sort();
}
