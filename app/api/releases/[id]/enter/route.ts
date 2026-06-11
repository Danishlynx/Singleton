import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRelease } from "@/db/releases";
import { getPublicLotteryState, insertEntry } from "@/db/lottery";

// Mode B: enter the draw window. The high-concurrency surface — random-UUID
// inserts barely contend under OCC, so no sharding is needed here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EnterBody = z.object({
  claimantId: z.string().trim().min(1).max(256),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: releaseId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = EnterBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const release = await getRelease(releaseId);
  if (!release) return NextResponse.json({ error: "release not found" }, { status: 404 });

  const lottery = await getPublicLotteryState(releaseId);
  if (!lottery) {
    return NextResponse.json(
      { error: "this release is first-come-first-served; use /claim" },
      { status: 409 },
    );
  }

  // Window guard: [opens_at, entry_closes_at) and not closed/drawn.
  const now = Date.now();
  const opensAt = new Date(release.opens_at).getTime();
  const closesAt = new Date(lottery.entryClosesAt).getTime();
  if (release.status === "closed" || lottery.drawnAt) {
    return NextResponse.json({ status: "closed", error: "the draw has run" }, { status: 409 });
  }
  if (now < opensAt) {
    return NextResponse.json(
      { status: "not_open", opensAt: new Date(opensAt).toISOString() },
      { status: 409 },
    );
  }
  if (now >= closesAt) {
    return NextResponse.json(
      { status: "window_closed", entryClosesAt: lottery.entryClosesAt },
      { status: 409 },
    );
  }

  const { entry, alreadyEntered } = await insertEntry(releaseId, parsed.data.claimantId);
  return NextResponse.json({ status: "entered", entryId: entry.id, alreadyEntered });
}
