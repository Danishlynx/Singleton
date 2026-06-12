import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createProvider, createRelease, getReleaseState, listReleases } from "@/db/releases";
import { isAdminRequest } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: list releases with live remaining counts. */
export async function GET() {
  const releases = await listReleases();
  const states = await Promise.all(releases.map((r) => getReleaseState(r.id)));
  return NextResponse.json({ releases: states.filter(Boolean) });
}

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  capacity: z.coerce.number().int().positive().max(1_000_000),
  shardCount: z.coerce.number().int().positive().max(512).default(32),
  opensAt: z.coerce.date().optional(), // ISO string or ms; defaults to now
  providerName: z.string().trim().min(1).max(200).default("Demo Provider"),
  // Mode B: presence of `lottery` makes the release a windowed lottery.
  lottery: z
    .object({
      entryClosesAt: z.coerce.date(),
    })
    .optional(),
  // Vendor branding (all optional; rendered with neutral fallbacks when absent).
  meta: z
    .object({
      imageUrl: z.url().startsWith("https://").max(2000).optional(),
      description: z.string().trim().max(1000).optional(),
      venue: z.string().trim().max(200).optional(),
      eventAt: z.coerce.date().optional(),
    })
    .optional(),
});

/** Admin: create a release (status 'open'; opens_at gates claiming). */
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { title, capacity, shardCount, opensAt, providerName, lottery, meta } = parsed.data;
  const effectiveOpensAt = opensAt ?? new Date();

  if (lottery && lottery.entryClosesAt.getTime() <= effectiveOpensAt.getTime()) {
    return NextResponse.json(
      { error: "lottery.entryClosesAt must be after opensAt" },
      { status: 400 },
    );
  }

  const providerId = await createProvider(providerName);
  const release = await createRelease({
    providerId,
    title,
    capacity,
    shardCount,
    opensAt: effectiveOpensAt,
    status: "open",
  });

  if (meta && (meta.imageUrl || meta.description || meta.venue || meta.eventAt)) {
    const { upsertReleaseMeta } = await import("@/db/release-meta");
    await upsertReleaseMeta(release.id, meta);
  }

  // Mode B: commit the seed at creation. Only the HASH is ever serialized here;
  // the seed itself stays server-side until the draw reveals it.
  let lotteryOut: { entryClosesAt: string; seedHash: string } | undefined;
  if (lottery) {
    const { generateSeed } = await import("@/domain/lottery");
    const { insertLotteryConfig } = await import("@/db/lottery");
    const { seed, seedHash } = generateSeed();
    await insertLotteryConfig(release.id, lottery.entryClosesAt, seed, seedHash);
    lotteryOut = { entryClosesAt: lottery.entryClosesAt.toISOString(), seedHash };
  }

  return NextResponse.json(
    {
      release: {
        id: release.id,
        title: release.title,
        capacity: release.capacity,
        shardCount: release.shard_count,
        status: release.status,
        opensAt: release.opens_at,
        mode: lottery ? "lottery" : "fcfs",
        lottery: lotteryOut,
      },
    },
    { status: 201 },
  );
}
