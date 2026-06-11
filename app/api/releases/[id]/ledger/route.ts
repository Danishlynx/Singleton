import { type NextRequest, NextResponse } from "next/server";
import { getLedger } from "@/db/allocations";
import { getRelease } from "@/db/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const release = await getRelease(id);
  if (!release) return NextResponse.json({ error: "release not found" }, { status: 404 });
  const allocations = await getLedger(id);
  return NextResponse.json({
    releaseId: id,
    title: release.title,
    capacity: release.capacity,
    count: allocations.length,
    withinCapacity: allocations.length <= release.capacity,
    // PRIVACY: the public ledger identifies allocations by (claimed_at, id, rank)
    // only — claimant identities are never serialized. For lottery releases this
    // also prevents mapping 'draw:'+entryId winners back to people.
    allocations: allocations.map((a) => ({
      id: a.id,
      claimedAt: a.claimedAt,
      rank: a.rank,
    })),
  });
}
