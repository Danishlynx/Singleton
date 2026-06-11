import { NextResponse } from "next/server";
import { query } from "@/db/query";
import { hasSecondaryRegion } from "@/env";

// pg + AWS SDK need the Node runtime (not Edge); never cache a health probe.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const rows = await query<{ ok: number; now: string }>("SELECT 1 AS ok, now()::text AS now");
    return NextResponse.json({
      status: "ok",
      db: rows[0],
      multiRegion: hasSecondaryRegion(),
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
