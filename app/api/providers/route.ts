import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createProviderWithKey } from "@/db/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RegisterBody = z.object({
  name: z.string().trim().min(1).max(200),
});

/**
 * Self-serve operator registration. Returns the new provider id and a secret
 * api key ONCE — the key is never selectable again, so the client must save it.
 * The operator then authenticates with `x-provider-key` to create releases they
 * own and delete only their own.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = RegisterBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const provider = await createProviderWithKey(parsed.data.name);
  return NextResponse.json(
    { provider: { id: provider.id, name: provider.name }, apiKey: provider.apiKey },
    { status: 201 },
  );
}
