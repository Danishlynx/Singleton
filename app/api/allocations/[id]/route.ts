import { type NextRequest, NextResponse } from "next/server";
import { getAllocationWithRank } from "@/db/allocations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await getAllocationWithRank(id);
  if (!receipt) return NextResponse.json({ error: "allocation not found" }, { status: 404 });
  return NextResponse.json(receipt);
}
