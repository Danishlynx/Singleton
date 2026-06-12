import { randomUUID } from "node:crypto";
import { query, queryOne } from "@/db/query";

export interface Allocation {
  id: string;
  release_id: string;
  claimant_id: string;
  shard_id: string;
  idempotency_key: string;
  claimed_at: Date;
}

const ALLOC_COLUMNS = "id, release_id, claimant_id, shard_id, idempotency_key, claimed_at";

/** PostgreSQL unique_violation (e.g. (release_id, claimant_id) or idempotency_key). */
export function isUniqueViolation(err: unknown): boolean {
  return Boolean(err) && typeof err === "object" && (err as { code?: unknown }).code === "23505";
}

export async function findAllocationByClaimant(
  releaseId: string,
  claimantId: string,
): Promise<Allocation | undefined> {
  return queryOne<Allocation>(
    `SELECT ${ALLOC_COLUMNS} FROM allocations WHERE release_id = $1 AND claimant_id = $2`,
    [releaseId, claimantId],
  );
}

export async function findAllocationByIdempotencyKey(
  idempotencyKey: string,
): Promise<Allocation | undefined> {
  return queryOne<Allocation>(
    `SELECT ${ALLOC_COLUMNS} FROM allocations WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
}

export async function getAllocationById(id: string): Promise<Allocation | undefined> {
  return queryOne<Allocation>(`SELECT ${ALLOC_COLUMNS} FROM allocations WHERE id = $1`, [id]);
}

export interface AllocationReceipt {
  allocationId: string;
  releaseId: string;
  releaseTitle: string;
  capacity: number;
  rank: number;
  claimedAt: string; // ISO 8601 (UTC)
  // Mode B: draw allocations carry idempotency_key 'draw:'+entryId; the receipt
  // page uses this to show lottery copy + the participant's public entry id.
  lotteryEntryId: string | null;
}

/**
 * Receipt data: the allocation's ordinal position (rank) is DERIVED, never stored.
 * rank = 1 + (# allocations in the same release ordered before this one by
 * (claimed_at, id)). The ordering is expressed explicitly (not as a row-value
 * tuple) for maximum DSQL compatibility, and matches the ledger's ORDER BY.
 */
export async function getAllocationWithRank(id: string): Promise<AllocationReceipt | undefined> {
  const row = await queryOne<{
    allocationId: string;
    releaseId: string;
    releaseTitle: string;
    capacity: number;
    rank: number;
    claimedAt: Date;
    idempotencyKey: string;
  }>(
    `SELECT
        a.id AS "allocationId",
        a.release_id AS "releaseId",
        r.title AS "releaseTitle",
        r.capacity AS "capacity",
        (1 + (
          SELECT count(*) FROM allocations a2
           WHERE a2.release_id = a.release_id
             AND (a2.claimed_at < a.claimed_at
                  OR (a2.claimed_at = a.claimed_at AND a2.id < a.id))
        ))::int AS "rank",
        a.claimed_at AS "claimedAt",
        a.idempotency_key AS "idempotencyKey"
       FROM allocations a
       JOIN releases r ON r.id = a.release_id
      WHERE a.id = $1`,
    [id],
  );
  if (!row) return undefined;
  const claimedAt = row.claimedAt instanceof Date ? row.claimedAt : new Date(row.claimedAt);
  return {
    allocationId: row.allocationId,
    releaseId: row.releaseId,
    releaseTitle: row.releaseTitle,
    capacity: row.capacity,
    rank: row.rank,
    claimedAt: claimedAt.toISOString(),
    lotteryEntryId: row.idempotencyKey.startsWith("draw:")
      ? row.idempotencyKey.slice("draw:".length)
      : null,
  };
}

export interface LedgerEntry {
  id: string;
  claimantId: string;
  claimedAt: string; // ISO 8601 (UTC)
  rank: number;
}

/**
 * The immutable, ordered allocation ledger for a release. Rank is assigned by
 * position in the (claimed_at, id) order — consistent with the receipt rank — and
 * is computed in app code (no window-function dependency).
 */
export async function getLedger(releaseId: string): Promise<LedgerEntry[]> {
  const rows = await query<{ id: string; claimant_id: string; claimed_at: Date }>(
    `SELECT id, claimant_id, claimed_at
       FROM allocations
      WHERE release_id = $1
      ORDER BY claimed_at, id`,
    [releaseId],
  );
  return rows.map((r, i) => ({
    id: r.id,
    claimantId: r.claimant_id,
    claimedAt: (r.claimed_at instanceof Date ? r.claimed_at : new Date(r.claimed_at)).toISOString(),
    rank: i + 1,
  }));
}

export async function countAllocations(releaseId: string): Promise<number> {
  const rows = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM allocations WHERE release_id = $1",
    [releaseId],
  );
  return rows[0]?.n ?? 0;
}

export async function addToWaitlist(releaseId: string, claimantId: string): Promise<void> {
  // Idempotent: a duplicate (release_id, claimant_id) is a no-op via the unique index.
  await query(
    `INSERT INTO waitlist (id, release_id, claimant_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [randomUUID(), releaseId, claimantId],
  );
}

export async function isOnWaitlist(releaseId: string, claimantId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "SELECT id FROM waitlist WHERE release_id = $1 AND claimant_id = $2",
    [releaseId, claimantId],
  );
  return Boolean(row);
}

/**
 * 1-based waitlist position, derived from (joined_at, id) order — same
 * derive-not-store discipline as allocation ranks. Undefined if not on the list.
 */
export async function getWaitlistPosition(
  releaseId: string,
  claimantId: string,
): Promise<number | undefined> {
  const row = await queryOne<{ pos: number }>(
    `SELECT (1 + count(*))::int AS pos
       FROM waitlist w2, waitlist me
      WHERE me.release_id = $1 AND me.claimant_id = $2
        AND w2.release_id = $1
        AND (w2.joined_at < me.joined_at
             OR (w2.joined_at = me.joined_at AND w2.id < me.id))`,
    [releaseId, claimantId],
  );
  // The self-join yields no rows when `me` doesn't exist; count() over zero rows
  // still returns one row with pos=1, so verify membership explicitly.
  if (!row) return undefined;
  return (await isOnWaitlist(releaseId, claimantId)) ? row.pos : undefined;
}
