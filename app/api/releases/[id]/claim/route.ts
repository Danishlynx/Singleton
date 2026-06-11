import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { claim, ClaimError } from "@/domain/claim";
import { isOccConflict } from "@/db/retry";

// pg + AWS SDK need the Node runtime; a claim must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ClaimBody = z.object({
  claimantId: z.string().trim().min(1).max(256),
  idempotencyKey: z.string().trim().min(1).max(256),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: releaseId } = await params; // Next 15: params is a Promise

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = ClaimBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await claim(releaseId, parsed.data.claimantId, parsed.data.idempotencyKey);
    switch (result.status) {
      case "allocated":
        return NextResponse.json(result, { status: 200 });
      case "sold_out":
        return NextResponse.json(result, { status: 200 });
      case "not_open":
        return NextResponse.json(result, { status: 409 });
    }
  } catch (err) {
    if (err instanceof ClaimError && err.code === "release_not_found") {
      return NextResponse.json({ error: "release not found" }, { status: 404 });
    }
    if (err instanceof ClaimError && err.code === "lottery_mode") {
      return NextResponse.json(
        { error: err.message, useEndpoint: "enter" },
        { status: 409 },
      );
    }
    // OCC retries exhausted under extreme contention — ask the client to retry.
    if (isOccConflict(err)) {
      return NextResponse.json(
        { status: "retry", error: "high contention, please retry", retryable: true },
        { status: 503, headers: { "Retry-After": "1" } },
      );
    }
    console.error("[claim] unexpected error:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
