import { type NextRequest, NextResponse } from "next/server";
import { deleteRelease } from "@/db/releases";
import { authorizeReleaseMutation } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete a release and all its child rows.
 *
 * Authorization (server-enforced, never trust the client): platform may delete
 * any release, a provider only one they own, otherwise 401/403/404. The check
 * runs before any destructive work.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authz = await authorizeReleaseMutation(req, id);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }
  await deleteRelease(id);
  return NextResponse.json({ deleted: true, id });
}
