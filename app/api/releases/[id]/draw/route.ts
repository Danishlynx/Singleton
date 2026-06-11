import { type NextRequest, NextResponse } from "next/server";
import { draw, DrawError } from "@/domain/draw";
import { isAdminRequest } from "@/lib/admin";
import { isOccConflict } from "@/db/retry";

// Mode B: run the commit-reveal draw. Admin-gated; idempotent (drawn_at guard),
// so calling it repeatedly is safe.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const result = await draw(id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DrawError) {
      const status =
        err.code === "not_lottery" ? 404 : err.code === "window_open" ? 409 : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (isOccConflict(err)) {
      return NextResponse.json(
        { error: "contention during draw, please retry", retryable: true },
        { status: 503, headers: { "Retry-After": "1" } },
      );
    }
    console.error("[draw] unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
