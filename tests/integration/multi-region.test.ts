import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createProvider, createRelease } from "@/db/releases";
import { claim } from "@/domain/claim";
import { query } from "@/db/query";
import { closePools } from "@/db/pool";

// Requires a PEERED multi-region pair: both DSQL_CLUSTER_ENDPOINT and
// DSQL_CLUSTER_ENDPOINT_SECONDARY configured. Skipped otherwise.
const hasMr = Boolean(
  process.env.DSQL_CLUSTER_ENDPOINT && process.env.DSQL_CLUSTER_ENDPOINT_SECONDARY,
);
const suite = hasMr ? describe : describe.skip;

suite("multi-region read-your-write (peered DSQL)", () => {
  afterAll(async () => {
    await closePools();
  });

  it("a claim committed via the primary endpoint is immediately visible via the secondary", async () => {
    const providerId = await createProvider("MR Test Clinic");
    const release = await createRelease({
      providerId,
      title: "MR release",
      capacity: 3,
      shardCount: 2,
      opensAt: new Date(Date.now() - 1_000),
      status: "open",
    });

    // Write through the PRIMARY region (failover disabled to pin the endpoint).
    const res = await claim(release.id, "mr@example.com", randomUUID(), {
      prefer: "primary",
      failover: false,
    });
    expect(res.status).toBe("allocated");
    if (res.status !== "allocated") return;

    // Read through the SECONDARY region — strong consistency means we read our write.
    const rows = await query<{ id: string }>(
      "SELECT id FROM allocations WHERE id = $1",
      [res.allocationId],
      { prefer: "secondary", failover: false },
    );
    expect(rows).toHaveLength(1);

    const rem = await query<{ remaining: number }>(
      "SELECT COALESCE(SUM(remaining), 0)::int AS remaining FROM release_shards WHERE release_id = $1",
      [release.id],
      { prefer: "secondary", failover: false },
    );
    expect(rem[0]?.remaining).toBe(2);
  });
});
