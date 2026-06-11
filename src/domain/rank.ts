/**
 * Pure ordinal-rank derivation (no DB) — used by the stress harness to independently
 * re-derive ranks from the ledger and assert they are exactly 1..N, unique, and
 * contiguous. The ordering MUST match the SQL receipt/ledger ordering: by
 * claimed_at ascending, then id ascending.
 *
 * Note on id ordering: crypto.randomUUID() yields lowercase canonical UUIDs, whose
 * lexicographic string order matches PostgreSQL's uuid byte order (dashes sit at
 * identical positions, so they never affect the relative comparison). So JS string
 * `<` here agrees with the SQL `a2.id < a.id` tiebreak.
 */
export interface Ordered {
  id: string;
  claimedAt: string | Date;
}

function ms(v: string | Date): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

export function compareByOrder(a: Ordered, b: Ordered): number {
  const ta = ms(a.claimedAt);
  const tb = ms(b.claimedAt);
  if (ta !== tb) return ta - tb;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** Return a new array sorted by (claimedAt, id) with a 1-based `rank` attached. */
export function deriveRanks<T extends Ordered>(rows: readonly T[]): Array<T & { rank: number }> {
  return [...rows].sort(compareByOrder).map((row, i) => ({ ...row, rank: i + 1 }));
}

export interface RankCheck {
  ok: boolean;
  count: number;
  reason?: string;
}

/**
 * Verify a set of ranks is exactly {1, 2, ..., n} — unique and contiguous.
 * Returns ok=false with a human-readable reason on the first violation.
 */
export function checkContiguousRanks(ranks: readonly number[]): RankCheck {
  const n = ranks.length;
  const seen = new Set<number>();
  for (const r of ranks) {
    if (!Number.isInteger(r) || r < 1 || r > n) {
      return { ok: false, count: n, reason: `rank ${r} out of range 1..${n}` };
    }
    if (seen.has(r)) {
      return { ok: false, count: n, reason: `duplicate rank ${r}` };
    }
    seen.add(r);
  }
  // seen has n unique values all within 1..n => exactly {1..n}
  return { ok: true, count: n };
}
