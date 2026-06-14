import "./load-env";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Curated showcase seed (v3): 54 branded releases, six per category, across both
 * allocation modes and several lifecycle states, with ORGANIC ACTIVITY (real
 * claims/entries through the domain layer) so the landing reads as a living
 * marketplace, not a fresh install.
 *
 * The event list lives in scripts/showcase-events.json (curated + image-verified
 * out of band). Every poster URL is re-checked to serve image/* before anything
 * is written — a showcase with broken images is worse than none.
 *
 *   npx tsx scripts/seed-showcase.ts
 *
 * Pair with scripts/cleanup-test-data.ts to reset to a clean slate first.
 */

const DAY = 86_400_000;

interface ShowcaseSpec {
  provider: string;
  title: string;
  capacity: number;
  shardCount: number;
  mode: "fcfs" | "lottery";
  windowDays?: number; // lottery only
  category: string; // slug from src/lib/categories.ts
  image: string;
  description: string;
  venue?: string;
  eventInDays?: number;
  claims?: number; // fcfs activity
  entries?: number; // lottery activity
}

const SHOWCASE: ShowcaseSpec[] = JSON.parse(
  readFileSync(new URL("./showcase-events.json", import.meta.url), "utf8"),
) as ShowcaseSpec[];

async function runBatches<T>(items: T[], batch: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += batch) {
    await Promise.all(items.slice(i, i + batch).map(fn));
  }
}

async function verifyImages(): Promise<void> {
  const failures: string[] = [];
  await runBatches(SHOWCASE, 10, async (s) => {
    try {
      const res = await fetch(s.image, { method: "HEAD" });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) {
        failures.push(`${s.title}: ${res.status} ${type}`);
      }
    } catch {
      failures.push(`${s.title}: fetch failed`);
    }
  });
  if (failures.length > 0) {
    throw new Error(`Posters not serving an image:\n  - ${failures.join("\n  - ")}`);
  }
  console.log(`All ${SHOWCASE.length} posters verified (HTTP image/*).`);
}

async function main(): Promise<void> {
  process.env.DB_POOL_MAX = process.env.DB_POOL_MAX ?? "16";
  const { createProvider, createRelease } = await import("@/db/releases");
  const { upsertReleaseMeta } = await import("@/db/release-meta");
  const { insertLotteryConfig, insertEntry } = await import("@/db/lottery");
  const { generateSeed } = await import("@/domain/lottery");
  const { claim } = await import("@/domain/claim");

  await verifyImages();
  const now = Date.now();

  // The landing lists newest-first, so seed in REVERSE of the desired display
  // order: the first entry in SHOWCASE ends up at the top of the page.
  for (const s of [...SHOWCASE].reverse()) {
    const providerId = await createProvider(s.provider);
    const release = await createRelease({
      providerId,
      title: s.title,
      capacity: s.capacity,
      shardCount: s.shardCount,
      opensAt: new Date(now - 60_000),
      status: "open",
    });
    if (s.mode === "lottery") {
      const { seed, seedHash } = generateSeed();
      await insertLotteryConfig(
        release.id,
        new Date(now + (s.windowDays ?? 1) * DAY),
        seed,
        seedHash,
      );
    }
    await upsertReleaseMeta(release.id, {
      imageUrl: s.image,
      description: s.description,
      venue: s.venue,
      eventAt: s.eventInDays ? new Date(now + s.eventInDays * DAY) : undefined,
      category: s.category,
    });

    // Organic activity through the real domain paths.
    if (s.claims) {
      const claimants = Array.from({ length: s.claims }, (_, i) => `demo-${i}-${randomUUID()}`);
      await runBatches(claimants, 10, (c) => claim(release.id, c, randomUUID()));
    }
    if (s.entries) {
      const entrants = Array.from({ length: s.entries }, (_, i) => `demo-${i}-${randomUUID()}`);
      await runBatches(entrants, 16, (e) => insertEntry(release.id, e));
    }

    console.log(
      `  ${s.mode === "lottery" ? "lottery" : "fcfs   "} [${s.category}] ${s.title}` +
        (s.claims ? `  (${s.claims} claimed)` : "") +
        (s.entries ? `  (${s.entries} entries)` : ""),
    );
  }

  console.log(`Showcase seeded: ${SHOWCASE.length} releases.`);
}

main()
  .then(async () => {
    const { closePools } = await import("@/db/pool");
    await closePools();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Showcase seed failed:", err);
    const { closePools } = await import("@/db/pool");
    await closePools();
    process.exit(1);
  });
