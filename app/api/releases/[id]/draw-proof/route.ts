import { type NextRequest, NextResponse } from "next/server";
import { getRelease } from "@/db/releases";
import {
  getLotteryConfigInternal,
  listEntryIds,
  winnerEntryIds,
} from "@/db/lottery";

// Mode B: the public draw proof. Anyone can recompute the winner set from this
// payload (seed revealed only post-draw). NEVER includes claimant_id — entries
// are identified solely by their public entry UUIDs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const release = await getRelease(id);
  if (!release) return NextResponse.json({ error: "release not found" }, { status: 404 });

  const cfg = await getLotteryConfigInternal(id);
  if (!cfg) return NextResponse.json({ error: "not a lottery release" }, { status: 404 });

  const drawn = cfg.drawn_at !== null;
  const entryIds = await listEntryIds(id);

  return NextResponse.json({
    releaseId: id,
    seedHash: cfg.seed_hash,
    // The seed is the commitment's reveal — strictly post-draw.
    seed: drawn ? cfg.seed : null,
    entryIds,
    winnerEntryIds: drawn ? await winnerEntryIds(id) : null,
    capacity: release.capacity,
    entrantCount: entryIds.length,
    drawnAt: drawn ? new Date(cfg.drawn_at as Date).toISOString() : null,
  });
}
