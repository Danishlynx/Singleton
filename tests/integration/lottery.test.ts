import { describe, it, expect, afterAll } from "vitest";
import { createProvider, createRelease, getRelease, getReleaseState } from "@/db/releases";
import {
  insertLotteryConfig,
  insertEntry,
  countEntries,
  listEntryIds,
  winnerEntryIds,
  getLotteryConfigInternal,
  getPublicLotteryState,
  getMode,
} from "@/db/lottery";
import { generateSeed, deriveWinners, sha256Utf8Hex } from "@/domain/lottery";
import { draw, DrawError } from "@/domain/draw";
import { query } from "@/db/query";
import { closePools } from "@/db/pool";

// Real-DSQL integration tests for Mode B. Skipped without a configured cluster.
const hasDb = Boolean(process.env.DSQL_CLUSTER_ENDPOINT);
const suite = hasDb ? describe : describe.skip;

async function freshLotteryRelease(opts: {
  capacity: number;
  shardCount: number;
  /** ms from now until the entry window closes (negative = already closed). */
  closesInMs: number;
}) {
  const providerId = await createProvider("Lottery Test Clinic");
  const release = await createRelease({
    providerId,
    title: "Lottery integration release",
    capacity: opts.capacity,
    shardCount: opts.shardCount,
    opensAt: new Date(Date.now() - 60_000),
    status: "open",
  });
  const { seed, seedHash } = generateSeed();
  await insertLotteryConfig(
    release.id,
    new Date(Date.now() + opts.closesInMs),
    seed,
    seedHash,
  );
  return { release, seed, seedHash };
}

/** Force the window shut so the draw guard passes (test scaffolding only). */
async function closeWindow(releaseId: string) {
  await query(
    "UPDATE lottery_config SET entry_closes_at = now() WHERE release_id = $1",
    [releaseId],
  );
}

suite("lottery integration (real DSQL)", () => {
  afterAll(async () => {
    await closePools();
  });

  it("mode resolution: lottery iff a config row exists", async () => {
    const { release } = await freshLotteryRelease({ capacity: 3, shardCount: 2, closesInMs: 60_000 });
    expect(await getMode(release.id)).toBe("lottery");

    const providerId = await createProvider("FCFS control");
    const fcfs = await createRelease({
      providerId,
      title: "control",
      capacity: 3,
      shardCount: 2,
      opensAt: new Date(),
      status: "open",
    });
    expect(await getMode(fcfs.id)).toBe("fcfs");
    const state = await getReleaseState(fcfs.id);
    expect(state?.mode).toBe("fcfs");
    expect(state?.entrantCount).toBeUndefined(); // Mode A payload unchanged
  });

  it("rejects FCFS claims on a lottery release (no fairness bypass)", async () => {
    const { release } = await freshLotteryRelease({ capacity: 3, shardCount: 2, closesInMs: 60_000 });
    const { claim, ClaimError } = await import("@/domain/claim");
    const { randomUUID } = await import("node:crypto");
    await expect(claim(release.id, "speedster@example.com", randomUUID())).rejects.toThrow(
      ClaimError,
    );
    const { countAllocations } = await import("@/db/allocations");
    expect(await countAllocations(release.id)).toBe(0);
  });

  it("enter is idempotent: same claimant returns the same entry", async () => {
    const { release } = await freshLotteryRelease({ capacity: 3, shardCount: 2, closesInMs: 60_000 });
    const first = await insertEntry(release.id, "alice@example.com");
    const again = await insertEntry(release.id, "alice@example.com");
    expect(again.entry.id).toBe(first.entry.id);
    expect(again.alreadyEntered).toBe(true);
    expect(await countEntries(release.id)).toBe(1);
  });

  it("seed is absent from public payloads pre-draw; seed_hash is public", async () => {
    const { release, seed, seedHash } = await freshLotteryRelease({
      capacity: 3,
      shardCount: 2,
      closesInMs: 60_000,
    });
    const pub = await getPublicLotteryState(release.id);
    expect(pub?.seedHash).toBe(seedHash);
    expect(JSON.stringify(pub)).not.toContain(seed);
    const state = await getReleaseState(release.id);
    expect(state?.seedHash).toBe(seedHash);
    expect(JSON.stringify(state)).not.toContain(seed);
  });

  it("draw refuses while the window is open", async () => {
    const { release } = await freshLotteryRelease({ capacity: 3, shardCount: 2, closesInMs: 60_000 });
    await insertEntry(release.id, "early@example.com");
    await expect(draw(release.id)).rejects.toThrow(DrawError);
  });

  it("draw selects min(capacity, entrants) distinct entrants, consumes shards, closes the release; re-derivable; repeat is a no-op", async () => {
    const capacity = 5;
    const { release, seed } = await freshLotteryRelease({
      capacity,
      shardCount: 3,
      closesInMs: 60_000,
    });
    for (let i = 0; i < 12; i++) {
      await insertEntry(release.id, `entrant-${i}@example.com`);
    }
    await closeWindow(release.id);

    const result = await draw(release.id);
    expect(result.status).toBe("drawn");
    expect(result.winners).toBe(capacity);
    expect(result.entrants).toBe(12);

    // Winners are distinct entrants, recorded via 'draw:'+entryId keys.
    const winners = await winnerEntryIds(release.id);
    expect(winners).toHaveLength(capacity);
    expect(new Set(winners).size).toBe(capacity);
    const allEntryIds = new Set(await listEntryIds(release.id));
    winners.forEach((w) => expect(allEntryIds.has(w)).toBe(true));

    // Pure-function re-derivation from the revealed seed matches stored winners.
    const cfg = await getLotteryConfigInternal(release.id);
    expect(cfg?.drawn_at).not.toBeNull();
    expect(sha256Utf8Hex(seed)).toBe(cfg!.seed_hash);
    const rederived = deriveWinners(seed, [...allEntryIds], capacity)
      .map((w) => w.id)
      .sort();
    expect(rederived).toEqual(winners);

    // Shards consumed: SUM(remaining) = capacity - winners; release closed.
    const state = await getReleaseState(release.id);
    expect(state?.remaining).toBe(0);
    expect(state?.allocated).toBe(capacity);
    expect((await getRelease(release.id))?.status).toBe("closed");

    // Idempotent: second draw is a no-op (drawn_at unchanged, no new allocations).
    const again = await draw(release.id);
    expect(again.status).toBe("already_drawn");
    const cfgAfter = await getLotteryConfigInternal(release.id);
    expect(cfgAfter?.drawn_at?.getTime()).toBe(cfg?.drawn_at?.getTime());
    expect(await winnerEntryIds(release.id)).toHaveLength(capacity);
  });

  it("under-subscribed draw: all entrants win, leftover stock remains, release closes", async () => {
    const { release, seed } = await freshLotteryRelease({
      capacity: 10,
      shardCount: 4,
      closesInMs: 60_000,
    });
    for (let i = 0; i < 3; i++) {
      await insertEntry(release.id, `few-${i}@example.com`);
    }
    await closeWindow(release.id);

    const result = await draw(release.id);
    expect(result.status).toBe("drawn");
    expect(result.winners).toBe(3);

    const winners = await winnerEntryIds(release.id);
    const rederived = deriveWinners(seed, await listEntryIds(release.id), 10)
      .map((w) => w.id)
      .sort();
    expect(rederived).toEqual(winners);

    const state = await getReleaseState(release.id);
    expect(state?.allocated).toBe(3);
    expect(state?.remaining).toBe(7); // leftover stays; re-opening is out of scope
    expect((await getRelease(release.id))?.status).toBe("closed");
  });
});
