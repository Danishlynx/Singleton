import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createProviderWithKey, getProviderByKey } from "@/db/providers";
import { createRelease, getRelease, deleteRelease } from "@/db/releases";
import { resolveActor, authorizeReleaseMutation } from "@/lib/admin";
import { getEnv } from "@/env";
import { query } from "@/db/query";
import { closePools } from "@/db/pool";

// Per-tenant ownership authorization, against the real cluster. Skipped without one.
const hasDb = Boolean(process.env.DSQL_CLUSTER_ENDPOINT);
const suite = hasDb ? describe : describe.skip;

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/test", { headers });
}

async function ownedRelease(providerId: string) {
  return createRelease({
    providerId,
    title: "Ownership test release",
    capacity: 5,
    shardCount: 2,
    opensAt: new Date(Date.now() - 60_000),
    status: "open",
  });
}

suite("per-tenant ownership (real DSQL)", () => {
  afterAll(async () => {
    await closePools();
  });

  it("provider key round-trips; unknown/empty keys resolve to null", async () => {
    const p = await createProviderWithKey("Acme Tickets");
    expect(p.apiKey).toMatch(/^op_/);
    const found = await getProviderByKey(p.apiKey);
    expect(found?.id).toBe(p.id);
    expect(found?.name).toBe("Acme Tickets");
    expect(await getProviderByKey("op_does_not_exist")).toBeNull();
    expect(await getProviderByKey(null)).toBeNull();
    expect(await getProviderByKey("")).toBeNull();
  });

  it("resolveActor distinguishes platform, provider, and none", async () => {
    const adminToken = getEnv().ADMIN_TOKEN;
    const p = await createProviderWithKey("Globex Events");

    expect(await resolveActor(reqWith({ "x-admin-token": adminToken }))).toEqual({
      role: "platform",
    });
    expect(await resolveActor(reqWith({ "x-provider-key": p.apiKey }))).toMatchObject({
      role: "provider",
      providerId: p.id,
      providerName: "Globex Events",
    });
    expect(await resolveActor(reqWith({}))).toEqual({ role: "none" });
    expect(await resolveActor(reqWith({ "x-admin-token": "definitely-wrong" }))).toEqual({
      role: "none",
    });
    // A wrong admin token must NOT fall through to a provider match.
    expect(await resolveActor(reqWith({ "x-provider-key": "op_wrong" }))).toEqual({ role: "none" });
  });

  it("authorizeReleaseMutation enforces ownership across every actor", async () => {
    const adminToken = getEnv().ADMIN_TOKEN;
    const owner = await createProviderWithKey("Owner Co");
    const other = await createProviderWithKey("Other Co");
    const rel = await ownedRelease(owner.id);

    // Owning provider: allowed, and the loaded release comes back.
    const asOwner = await authorizeReleaseMutation(reqWith({ "x-provider-key": owner.apiKey }), rel.id);
    expect(asOwner.ok).toBe(true);
    if (asOwner.ok) expect(asOwner.release.id).toBe(rel.id);

    // A different provider: forbidden.
    expect(
      await authorizeReleaseMutation(reqWith({ "x-provider-key": other.apiKey }), rel.id),
    ).toMatchObject({ ok: false, status: 403 });

    // Platform: allowed on anyone's release.
    expect(
      await authorizeReleaseMutation(reqWith({ "x-admin-token": adminToken }), rel.id),
    ).toMatchObject({ ok: true });

    // Unauthenticated: 401.
    expect(await authorizeReleaseMutation(reqWith({}), rel.id)).toMatchObject({
      ok: false,
      status: 401,
    });

    // Authenticated but the release doesn't exist: 404.
    expect(
      await authorizeReleaseMutation(reqWith({ "x-provider-key": owner.apiKey }), randomUUID()),
    ).toMatchObject({ ok: false, status: 404 });

    await deleteRelease(rel.id);
  });

  it("deleteRelease cascades: release and all children are removed", async () => {
    const owner = await createProviderWithKey("Cascade Co");
    const rel = await ownedRelease(owner.id);

    // Sanity: shard rows exist before delete.
    const shardsBefore = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM release_shards WHERE release_id = $1",
      [rel.id],
    );
    expect(shardsBefore[0].n).toBe(2);

    await deleteRelease(rel.id);

    expect(await getRelease(rel.id)).toBeUndefined();
    const shardsAfter = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM release_shards WHERE release_id = $1",
      [rel.id],
    );
    expect(shardsAfter[0].n).toBe(0);
  });
});
