import { type NextRequest, NextResponse } from "next/server";
import { draw, DrawError } from "@/domain/draw";
import { authorizeReleaseMutation } from "@/lib/admin";
import { isOccConflict } from "@/db/retry";

// Mode B: run the commit-reveal draw. Restricted to the platform admin or the
// owning provider; idempotent (drawn_at guard), so repeated calls are safe.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authz = await authorizeReleaseMutation(req, id);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

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
