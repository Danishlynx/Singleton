import { randomUUID } from "node:crypto";
import { query, withConnection, type QueryOpts } from "@/db/query";
import { withRetry } from "@/db/retry";
import { shuffle } from "@/domain/shards";
import { getRelease } from "@/db/releases";
import {
  addToWaitlist,
  findAllocationByClaimant,
  findAllocationByIdempotencyKey,
  isUniqueViolation,
} from "@/db/allocations";

export class ClaimError extends Error {
  constructor(
    public code: "release_not_found" | "duplicate_unresolved" | "lottery_mode",
    message: string,
  ) {
    super(message);
    this.name = "ClaimError";
  }
}

export type ClaimResult =
  | { status: "allocated"; allocationId: string; alreadyHeld: boolean }
  | { status: "sold_out"; waitlisted: boolean }
  | { status: "not_open"; opensAt: string };

export interface ClaimOptions extends QueryOpts {
  maxAttempts?: number;
  /** Track OCC retries (for stress metrics). Called once per retried attempt. */
  onRetry?: (attempt: number, err: unknown) => void;
}

type ShardOutcome =
  | { kind: "allocated"; allocationId: string }
  | { kind: "empty" }
  | { kind: "duplicate" };

/**
 * The claim algorithm (the heart). Guarantees, under concurrency:
 *   (a) remaining >= 0 always (CHECK + conditional decrement) => no oversell;
 *   (b) at most one allocation per claimant (unique index, idempotent);
 *   (c) total allocations <= capacity;
 *   (d) a stable first-come order via claimed_at.
 *
 * Strategy: short-circuit if the claimant already holds a slot; otherwise try
 * shards in a random order, each in its own transaction doing a conditional
 * decrement + allocation insert. A commit-time OCC conflict (SQLSTATE 40001)
 * retries the whole claim with backoff; a unique violation means the claimant
 * already has a slot, so we return it (idempotent). When every shard is empty,
 * the release is sold out and the claimant joins the waitlist.
 */
export async function claim(
  releaseId: string,
  claimantId: string,
  idempotencyKey: string,
  opts: ClaimOptions = {},
): Promise<ClaimResult> {
  const connOpts: QueryOpts = { prefer: opts.prefer, failover: opts.failover };

  const release = await getRelease(releaseId);
  if (!release) {
    throw new ClaimError("release_not_found", `Release ${releaseId} not found`);
  }

  // Mode guard: a lottery release allocates ONLY through the draw. Without this,
  // direct claims would bypass the fairness window entirely.
  const { getMode } = await import("@/db/lottery");
  if ((await getMode(releaseId)) === "lottery") {
    throw new ClaimError(
      "lottery_mode",
      "this release uses a windowed lottery — enter the draw instead of claiming",
    );
  }

  const opensAtMs =
    release.opens_at instanceof Date
      ? release.opens_at.getTime()
      : new Date(release.opens_at).getTime();
  if (release.status !== "open" || opensAtMs > Date.now()) {
    return { status: "not_open", opensAt: new Date(opensAtMs).toISOString() };
  }

  // 0) Idempotent short-circuit: no write if this claimant already holds a slot.
  const existing = await findAllocationByClaimant(releaseId, claimantId);
  if (existing) {
    return { status: "allocated", allocationId: existing.id, alreadyHeld: true };
  }

  // 1) Attempt with OCC-aware retry of the WHOLE claim.
  const allocated = await withRetry(
    async () => {
      // SPEC-NOTE: the spec walks ALL shard indexes blind; we first read which shards
      // still have stock (one round trip) and walk only those, shuffled. This is purely
      // a latency optimization — the read can be stale under concurrency, but correctness
      // is enforced solely by the conditional UPDATE inside the transaction below. It
      // turns a sold-out claim from O(shard_count) probe transactions into one SELECT.
      const candidates = await query<{ shard_index: number }>(
        "SELECT shard_index FROM release_shards WHERE release_id = $1 AND remaining > 0",
        [releaseId],
        connOpts,
      );
      if (candidates.length === 0) return null; // sold out (verified by UPDATE guard otherwise)
      const order = shuffle(candidates.map((c) => c.shard_index));
      for (const shardIndex of order) {
        const allocationId = randomUUID();
        const outcome = await withConnection<ShardOutcome>(async (client) => {
          await client.query("BEGIN");
          try {
            const upd = await client.query<{ id: string }>(
              `UPDATE release_shards
                  SET remaining = remaining - 1
                WHERE release_id = $1 AND shard_index = $2 AND remaining > 0
                RETURNING id`,
              [releaseId, shardIndex],
            );
            if (upd.rowCount === 0) {
              await client.query("COMMIT"); // shard empty; nothing changed
              return { kind: "empty" };
            }
            await client.query(
              `INSERT INTO allocations (id, release_id, claimant_id, shard_id, idempotency_key)
               VALUES ($1, $2, $3, $4, $5)`,
              [allocationId, releaseId, claimantId, upd.rows[0].id, idempotencyKey],
            );
            await client.query("COMMIT");
            return { kind: "allocated", allocationId };
          } catch (err) {
            await client.query("ROLLBACK").catch(() => undefined);
            // Unique violation => this claimant already has a slot (or the same
            // idempotency key was used). The decrement rolled back, so no oversell.
            if (isUniqueViolation(err)) return { kind: "duplicate" };
            throw err; // OCC (40001) and others bubble to withRetry
          }
        }, connOpts);

        if (outcome.kind === "allocated") {
          return { allocationId: outcome.allocationId, alreadyHeld: false };
        }
        if (outcome.kind === "duplicate") {
          const byClaimant = await findAllocationByClaimant(releaseId, claimantId);
          if (byClaimant) return { allocationId: byClaimant.id, alreadyHeld: true };
          // The idempotency_key index is global, so a unique violation can mean the
          // SAME key was replayed by a DIFFERENT claimant. Only return the allocation
          // when it actually belongs to this claimant — never leak another's receipt.
          const byKey = await findAllocationByIdempotencyKey(idempotencyKey);
          if (byKey && byKey.claimant_id === claimantId) {
            return { allocationId: byKey.id, alreadyHeld: true };
          }
          throw new ClaimError(
            "duplicate_unresolved",
            "unique violation but no existing allocation for this claimant",
          );
        }
        // empty => try the next shard
      }
      return null; // every shard exhausted
    },
    { maxAttempts: opts.maxAttempts ?? 8, onRetry: opts.onRetry },
  );

  if (allocated) {
    return {
      status: "allocated",
      allocationId: allocated.allocationId,
      alreadyHeld: allocated.alreadyHeld ?? false,
    };
  }

  // 2) Sold out => fair waitlist (idempotent).
  await addToWaitlist(releaseId, claimantId);
  return { status: "sold_out", waitlisted: true };
}
