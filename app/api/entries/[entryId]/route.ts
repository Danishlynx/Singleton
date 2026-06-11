import { type NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/db/query";
import { getPublicLotteryState } from "@/db/lottery";
import { findAllocationByIdempotencyKey } from "@/db/allocations";

// Mode B: a participant checks their own result by the entryId THEY hold (it was
// returned to them at enter time and never published with their identity).
// Pre-draw: selected is null. Post-draw: selected + the receipt allocationId.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;

  const entry = await queryOne<{ id: string; release_id: string }>(
    "SELECT id, release_id FROM entries WHERE id = $1",
    [entryId],
  );
  if (!entry) return NextResponse.json({ error: "entry not found" }, { status: 404 });

  const lottery = await getPublicLotteryState(entry.release_id);
  const drawn = Boolean(lottery?.drawnAt);
  if (!drawn) {
    return NextResponse.json({
      entryId,
      releaseId: entry.release_id,
      drawn: false,
      selected: null,
      allocationId: null,
    });
  }

  const allocation = await findAllocationByIdempotencyKey(`draw:${entryId}`);
  return NextResponse.json({
    entryId,
    releaseId: entry.release_id,
    drawn: true,
    selected: Boolean(allocation),
    allocationId: allocation?.id ?? null,
  });
}
