import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createProvider, createRelease, getReleaseState } from "@/db/releases";
import { claim } from "@/domain/claim";
import { countAllocations, getLedger, isOnWaitlist } from "@/db/allocations";
import { query } from "@/db/query";
import { closePools } from "@/db/pool";
import { deriveRanks, checkContiguousRanks } from "@/domain/rank";

// Integration tests require a real Aurora DSQL cluster (env + migrations applied).
// They are skipped automatically when DSQL_CLUSTER_ENDPOINT is not configured.
const hasDb = Boolean(process.env.DSQL_CLUSTER_ENDPOINT);
const suite = hasDb ? describe : describe.skip;

async function freshOpenRelease(capacity: number, shardCount: number) {
  const providerId = await createProvider("Integration Test Clinic");
  return createRelease({
    providerId,
    title: "Integration release",
    capacity,
    shardCount,
    opensAt: new Date(Date.now() - 1_000), // already open
    status: "open",
  });
}

suite("claim integration (real DSQL)", () => {
  afterAll(async () => {
    await closePools();
  });

  it("happy path: returns an allocation", async () => {
    const r = await freshOpenRelease(5, 4);
    const res = await claim(r.id, "alice@example.com", randomUUID());
    expect(res.status).toBe("allocated");
    if (res.status === "allocated") {
      expect(res.allocationId).toBeTruthy();
      expect(res.alreadyHeld).toBe(false);
    }
  });

  it("idempotent: same claimant returns the same allocation (one slot)", async () => {
    const r = await freshOpenRelease(5, 4);
    const first = await claim(r.id, "bob", randomUUID());
    const second = await claim(r.id, "bob", randomUUID()); // different key, same claimant
    expect(first.status).toBe("allocated");
    expect(second.status).toBe("allocated");
    if (first.status === "allocated" && second.status === "allocated") {
      expect(second.allocationId).toBe(first.allocationId);
      expect(second.alreadyHeld).toBe(true);
    }
    expect(await countAllocations(r.id)).toBe(1);
  });

  it("idempotent: same idempotency key returns the same allocation", async () => {
    const r = await freshOpenRelease(5, 4);
    const key = randomUUID();
    const first = await claim(r.id, "carol", key);
    const again = await claim(r.id, "carol", key);
    expect(first.status).toBe("allocated");
    if (first.status === "allocated" && again.status === "allocated") {
      expect(again.allocationId).toBe(first.allocationId);
    }
    expect(await countAllocations(r.id)).toBe(1);
  });

  it("sells out exactly at capacity and waitlists the overflow", async () => {
    const capacity = 3;
    const r = await freshOpenRelease(capacity, 2);
    for (let i = 0; i < capacity; i++) {
      const res = await claim(r.id, `u${i}`, randomUUID());
      expect(res.status).toBe("allocated");
    }
    const overflow = await claim(r.id, "late", randomUUID());
    expect(overflow.status).toBe("sold_out");
    expect(await isOnWaitlist(r.id, "late")).toBe(true);
    expect(await countAllocations(r.id)).toBe(capacity);
    const state = await getReleaseState(r.id);
    expect(state?.remaining).toBe(0);
    expect(state?.allocated).toBe(capacity);
  });

  it("under concurrency: no oversell, exactly capacity, ranks 1..capacity contiguous", async () => {
    const capacity = 10;
    const attempts = 50;
    const r = await freshOpenRelease(capacity, 2); // few shards => forces OCC retries
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        claim(r.id, `c${i}-${randomUUID()}`, randomUUID()),
      ),
    );
    const allocated = results.filter((x) => x.status === "allocated").length;
    const soldOut = results.filter((x) => x.status === "sold_out").length;
    expect(allocated).toBe(capacity);
    expect(soldOut).toBe(attempts - capacity);

    const shards = await query<{ remaining: number }>(
      "SELECT remaining FROM release_shards WHERE release_id = $1",
      [r.id],
    );
    expect(shards.every((s) => s.remaining >= 0)).toBe(true); // no shard went negative
    const sumRemaining = shards.reduce((a, s) => a + s.remaining, 0);
    expect(sumRemaining).toBe(capacity - allocated); // no oversell
    expect(await countAllocations(r.id)).toBe(capacity);

    const ledger = await getLedger(r.id);
    expect(ledger).toHaveLength(capacity);
    const ranks = deriveRanks(ledger.map((l) => ({ id: l.id, claimedAt: l.claimedAt }))).map(
      (x) => x.rank,
    );
    expect(checkContiguousRanks(ranks)).toEqual({ ok: true, count: capacity });
  });
});
