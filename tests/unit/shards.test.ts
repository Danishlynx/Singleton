import { describe, it, expect } from "vitest";
import { distributeCapacity, shuffle } from "@/domain/shards";

describe("distributeCapacity", () => {
  it("sums to capacity for the default 200/32 case", () => {
    const shards = distributeCapacity(200, 32);
    expect(shards).toHaveLength(32);
    expect(shards.reduce((a, b) => a + b, 0)).toBe(200);
  });

  it("spreads the remainder across the FIRST shards (evenly as possible)", () => {
    const shards = distributeCapacity(200, 32); // base 6, remainder 8
    expect(shards.slice(0, 8)).toEqual(Array(8).fill(7));
    expect(shards.slice(8)).toEqual(Array(24).fill(6));
    const max = Math.max(...shards);
    const min = Math.min(...shards);
    expect(max - min).toBeLessThanOrEqual(1); // as even as possible
  });

  it("handles capacity < shardCount (some shards get 0)", () => {
    const shards = distributeCapacity(5, 32);
    expect(shards.reduce((a, b) => a + b, 0)).toBe(5);
    expect(shards.slice(0, 5)).toEqual(Array(5).fill(1));
    expect(shards.slice(5).every((n) => n === 0)).toBe(true);
  });

  it("handles a single shard", () => {
    expect(distributeCapacity(200, 1)).toEqual([200]);
  });

  it("sums to capacity across many fuzzed inputs", () => {
    for (const cap of [1, 7, 13, 100, 199, 200, 1000, 3001]) {
      for (const n of [1, 2, 5, 32, 64, 128]) {
        const shards = distributeCapacity(cap, n);
        expect(shards).toHaveLength(n);
        expect(shards.reduce((a, b) => a + b, 0)).toBe(cap);
        expect(shards.every((x) => x >= 0)).toBe(true);
      }
    }
  });

  it("rejects invalid inputs", () => {
    expect(() => distributeCapacity(0, 32)).toThrow();
    expect(() => distributeCapacity(-1, 32)).toThrow();
    expect(() => distributeCapacity(10, 0)).toThrow();
    expect(() => distributeCapacity(1.5, 32)).toThrow();
  });
});

describe("shuffle", () => {
  it("returns a permutation (same multiset) and does not mutate the input", () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7];
    const out = shuffle(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([0, 1, 2, 3, 4, 5, 6, 7]); // unchanged
  });

  it("is deterministic with an injected RNG", () => {
    const seq = [0.1, 0.9, 0.3, 0.7, 0.5];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    i = 0;
    const a = shuffle([1, 2, 3, 4, 5], rng);
    i = 0;
    const b = shuffle([1, 2, 3, 4, 5], rng);
    expect(a).toEqual(b);
  });
});
