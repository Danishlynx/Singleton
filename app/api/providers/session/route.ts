import { type NextRequest, NextResponse } from "next/server";
import { getProviderByKey } from "@/db/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve an operator key to its provider identity, so an operator pasting an
 * existing key (e.g. on another device) can sign in. Returns 401 if the key is
 * unknown. The key itself is never echoed back.
 */
export async function POST(req: NextRequest) {
  const provider = await getProviderByKey(req.headers.get("x-provider-key"));
  if (!provider) {
    return NextResponse.json({ error: "invalid operator key" }, { status: 401 });
  }
  return NextResponse.json({ provider: { id: provider.id, name: provider.name } });
}
