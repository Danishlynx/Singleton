import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Non-destructive check that the presented x-admin-token matches this server's
 * ADMIN_TOKEN. Lets the admin console validate a platform token at sign-in (and
 * detect a stale token saved for a different environment) instead of accepting
 * it blindly and failing later with a misleading "session expired".
 */
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "invalid admin token" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
