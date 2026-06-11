import { describe, it, expect } from "vitest";
import {
  sha256Utf8Hex,
  generateSeed,
  entryScore,
  deriveWinners,
  planShardConsumption,
  assignShards,
  type ShardStock,
} from "@/domain/lottery";
import {
  sha256Utf8HexBrowser,
  entryScoreBrowser,
  deriveWinnersBrowser,
} from "@/lib/sha256";

// §4 PARITY FIXTURE — generated once with Node createHash and pinned. The server
// (node:crypto) and browser (WebCrypto) implementations must both reproduce these
// exact values; any drift breaks the public "Re-run the draw" proof.
const FIXTURE = {
  seed: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
  entryId: "018f3a5e-7c4d-4b2a-9e1f-5a6b7c8d9e0f",
  seedHash: "2a8abfa8cb9906290437854193ca6bca41d4d4e26d1d454bd66a35158095e737",
  score: "889b1545bb10dcda7bddc07551402535af58fc615e3a3875c3c6beab3801f91d",
};

describe("§4 hash parity (server + browser must match byte-for-byte)", () => {
  it("server: seed hash + entry score reproduce the pinned fixture", () => {
    expect(sha256Utf8Hex(FIXTURE.seed)).toBe(FIXTURE.seedHash);
    expect(entryScore(FIXTURE.seed, FIXTURE.entryId)).toBe(FIXTURE.score);
  });

  it("browser (WebCrypto): reproduces the same fixture exactly", async () => {
    await expect(sha256Utf8HexBrowser(FIXTURE.seed)).resolves.toBe(FIXTURE.seedHash);
    await expect(entryScoreBrowser(FIXTURE.seed, FIXTURE.entryId)).resolves.toBe(FIXTURE.score);
  });

  it("server and browser agree on arbitrary inputs", async () => {
    const { seed } = generateSeed();
    const id = crypto.randomUUID();
    await expect(entryScoreBrowser(seed, id)).resolves.toBe(entryScore(seed, id));
  });
});

describe("generateSeed", () => {
  it("returns a 64-char lowercase hex seed and its matching commitment", () => {
    const { seed, seedHash } = generateSeed();
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(seedHash).toBe(sha256Utf8Hex(seed));
  });
});

describe("deriveWinners", () => {
  const ids = Array.from({ length: 50 }, () => crypto.randomUUID());

  it("is deterministic: same seed + entries → identical winner list", () => {
    const { seed } = generateSeed();
    const a = deriveWinners(seed, ids, 10);
    const b = deriveWinners(seed, [...ids].reverse(), 10); // input order irrelevant
    expect(a).toEqual(b);
  });

  it("different seed → different winners (overwhelmingly)", () => {
    const a = deriveWinners(generateSeed().seed, ids, 10).map((w) => w.id);
    const b = deriveWinners(generateSeed().seed, ids, 10).map((w) => w.id);
    expect(a).not.toEqual(b);
  });

  it("takes min(capacity, entrants) distinct entries, sorted by (score, id)", () => {
    const { seed } = generateSeed();
    const winners = deriveWinners(seed, ids, 200);
    expect(winners).toHaveLength(50); // capped at entrant count
    const scores = winners.map((w) => `${w.score}:${w.id}`);
    expect([...scores].sort()).toEqual(scores); // already in (score, id) order
    expect(new Set(winners.map((w) => w.id)).size).toBe(50);
  });

  it("browser re-derivation matches the server winner set exactly", async () => {
    const { seed } = generateSeed();
    const server = deriveWinners(seed, ids, 10);
    const browser = await deriveWinnersBrowser(seed, ids, 10);
    expect(browser).toEqual(server);
  });
});

describe("planShardConsumption / assignShards", () => {
  const shards: ShardStock[] = [
    { id: "s0", shard_index: 0, remaining: 7 },
    { id: "s1", shard_index: 1, remaining: 0 },
    { id: "s2", shard_index: 2, remaining: 5 },
    { id: "s3", shard_index: 3, remaining: 8 },
  ];

  it("walks shards in index order and sums exactly to the winner count", () => {
    const plan = planShardConsumption(shards, 14);
    expect(plan).toEqual([
      { shardId: "s0", take: 7 },
      { shardId: "s2", take: 5 },
      { shardId: "s3", take: 2 },
    ]);
    expect(plan.reduce((a, p) => a + p.take, 0)).toBe(14);
  });

  it("expands to one shard per winner, preserving plan order", () => {
    const plan = planShardConsumption(shards, 9);
    const assigned = assignShards(plan, 9);
    expect(assigned).toHaveLength(9);
    expect(assigned.slice(0, 7).every((s) => s === "s0")).toBe(true);
    expect(assigned.slice(7)).toEqual(["s2", "s2"]);
  });

  it("throws when stock is insufficient", () => {
    expect(() => planShardConsumption(shards, 21)).toThrow(/insufficient shard stock/);
  });

  it("handles zero winners (under-subscribed edge)", () => {
    expect(planShardConsumption(shards, 0)).toEqual([]);
    expect(assignShards([], 0)).toEqual([]);
  });
});
