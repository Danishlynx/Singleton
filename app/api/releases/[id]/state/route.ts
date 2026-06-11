import { type NextRequest, NextResponse } from "next/server";
import { getReleaseState } from "@/db/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // polled live count — never cache

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getReleaseState(id);
  if (!state) return NextResponse.json({ error: "release not found" }, { status: 404 });
  return NextResponse.json(state);
}
