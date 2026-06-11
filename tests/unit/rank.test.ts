import { describe, it, expect } from "vitest";
import { compareByOrder, deriveRanks, checkContiguousRanks } from "@/domain/rank";

describe("compareByOrder", () => {
  it("orders by claimedAt, then by id", () => {
    const a = { id: "b", claimedAt: "2026-01-01T00:00:00.000Z" };
    const b = { id: "a", claimedAt: "2026-01-01T00:00:01.000Z" };
    expect(compareByOrder(a, b)).toBeLessThan(0); // earlier time wins
    const c = { id: "a", claimedAt: "2026-01-01T00:00:00.000Z" };
    const d = { id: "b", claimedAt: "2026-01-01T00:00:00.000Z" };
    expect(compareByOrder(c, d)).toBeLessThan(0); // tie -> id 'a' < 'b'
  });
});

describe("deriveRanks", () => {
  it("assigns contiguous 1-based ranks in (claimedAt, id) order", () => {
    const rows = [
      { id: "x2", claimedAt: "2026-01-01T00:00:02.000Z" },
      { id: "x0", claimedAt: "2026-01-01T00:00:00.000Z" },
      { id: "x1", claimedAt: "2026-01-01T00:00:01.000Z" },
    ];
    const ranked = deriveRanks(rows);
    expect(ranked.map((r) => r.id)).toEqual(["x0", "x1", "x2"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("breaks claimedAt ties by id (matching SQL uuid order)", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const rows = [
      { id: "ffff", claimedAt: t },
      { id: "0000", claimedAt: t },
      { id: "8888", claimedAt: t },
    ];
    expect(deriveRanks(rows).map((r) => r.id)).toEqual(["0000", "8888", "ffff"]);
  });
});

describe("checkContiguousRanks", () => {
  it("accepts exactly {1..n}", () => {
    expect(checkContiguousRanks([3, 1, 2, 5, 4])).toEqual({ ok: true, count: 5 });
  });
  it("rejects duplicates", () => {
    const r = checkContiguousRanks([1, 2, 2]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/duplicate/);
  });
  it("rejects out-of-range / gaps", () => {
    const r = checkContiguousRanks([1, 2, 4]); // 4 > n=3
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/out of range/);
  });
  it("treats empty as ok (count 0)", () => {
    expect(checkContiguousRanks([])).toEqual({ ok: true, count: 0 });
  });
});
