import "./load-env";
import { randomUUID } from "node:crypto";

/**
 * Curated showcase seed (v2): six branded releases across both modes and several
 * lifecycle states, with ORGANIC ACTIVITY (real claims/entries through the domain
 * layer) so the landing reads as a living marketplace, not a fresh install.
 *
 * Every poster URL is verified to serve image/* before anything is written —
 * a showcase with broken images is worse than none. All posters visually vetted.
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
  image: string;
  description: string;
  venue?: string;
  eventInDays?: number;
  claims?: number; // fcfs activity
  entries?: number; // lottery activity
}

const SHOWCASE: ShowcaseSpec[] = [
  {
    provider: "Aurora Live Events",
    title: "Midnight Frequencies World Tour",
    capacity: 500,
    shardCount: 32,
    mode: "fcfs",
    image:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=2000&q=85&auto=format&fit=crop",
    description:
      "500 floor tickets released at once. First come, first served, and provably never more than 500.",
    venue: "City Arena, Mumbai",
    eventInDays: 30,
    claims: 42,
  },
  {
    provider: "GameDev Germany e.V.",
    title: "GameDev Germany Founders' Night",
    capacity: 200,
    shardCount: 32,
    mode: "fcfs",
    image: "https://drive.google.com/thumbnail?id=1YFVkgr6VSMFQDKH33Msriexso9ZNUKKf&sz=w2000",
    description:
      "A night for the people who ship worlds. 200 seats, allocated in arrival order on a public ledger.",
    venue: "Rosalind Avenue, Berlin",
    eventInDays: 33,
    claims: 17,
  },
  {
    provider: "CloudConf Europe",
    title: "CloudConf 2026: serverless databases workshop",
    capacity: 150,
    shardCount: 32,
    mode: "fcfs",
    image:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=2000&q=85&auto=format&fit=crop",
    description:
      "150 hands-on lab seats for the serverless databases track. Fittingly, every seat here is allocated by one ACID transaction.",
    venue: "Hall 7, RAI Amsterdam",
    eventInDays: 21,
    claims: 38,
  },
  {
    provider: "Sunrise Community Clinic",
    title: "Free flu vaccination, Saturday block",
    capacity: 120,
    shardCount: 16,
    mode: "lottery",
    windowDays: 3,
    image:
      "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=2000&q=85&auto=format&fit=crop",
    description:
      "Enter any time before Saturday's draw. A bot that enters in the first second has exactly the same odds as you.",
    venue: "Sunrise Clinic, Hall B",
    eventInDays: 4,
    entries: 28,
  },
  {
    provider: "Harbour Hack Collective",
    title: "Harbour Hackathon 2026 team slots",
    capacity: 80,
    shardCount: 16,
    mode: "lottery",
    windowDays: 4,
    image:
      "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=2000&q=85&auto=format&fit=crop",
    description:
      "80 team slots for a weekend of building. Enter any time this week; the draw treats every team the same.",
    venue: "Innovation Dock, Rotterdam",
    eventInDays: 40,
    entries: 57,
  },
  {
    provider: "Form & Field",
    title: "FF-01 'Indigo' limited drop",
    capacity: 24,
    shardCount: 8,
    mode: "lottery",
    windowDays: 1,
    image:
      "https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=2000&q=85&auto=format&fit=crop",
    description:
      "24 pairs, already oversubscribed. The draw seed is committed below, and you can re-run the draw yourself after it reveals.",
    venue: "Online, ships worldwide",
    entries: 61,
  },
  {
    provider: "Northside Animal Shelter",
    title: "Puppy adoption Saturday appointments",
    capacity: 40,
    shardCount: 8,
    mode: "fcfs",
    image:
      "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=2000&q=85&auto=format&fit=crop",
    description:
      "40 meet-and-adopt appointments for Saturday morning. First come, first served, and the shelter can prove nobody jumped the queue.",
    venue: "Northside Shelter, Hall 2",
    eventInDays: 5,
    claims: 11,
  },
  {
    provider: "Åsen Supper Club",
    title: "Chef's table, one night only",
    capacity: 12,
    shardCount: 4,
    mode: "fcfs",
    image:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=2000&q=85&auto=format&fit=crop",
    description: "Twelve seats at the pass. When they're gone, the ledger proves it.",
    venue: "Åsen Supper Club, Oslo",
    eventInDays: 9,
    claims: 7,
  },
  {
    provider: "Hilltop Observatory",
    title: "Stargazing night: telescope sessions",
    capacity: 60,
    shardCount: 8,
    mode: "lottery",
    windowDays: 5,
    image:
      "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=2000&q=85&auto=format&fit=crop",
    description:
      "60 telescope slots under a dark sky, already oversubscribed. Winners are drawn from the whole window, not from whoever clicked fastest.",
    venue: "Hilltop Observatory ridge deck",
    eventInDays: 18,
    entries: 96,
  },
  {
    provider: "City Marathon Foundation",
    title: "City Marathon 2027 guaranteed entries",
    capacity: 1000,
    shardCount: 32,
    mode: "lottery",
    windowDays: 6,
    image:
      "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=2000&q=85&auto=format&fit=crop",
    description:
      "1,000 guaranteed race entries by fair draw. No refresh-mashing at 6am, because the window is open for a week.",
    venue: "Start line: Harbour Bridge",
    eventInDays: 200,
    entries: 134,
  },
];

async function verifyImages(): Promise<void> {
  for (const s of SHOWCASE) {
    const res = await fetch(s.image, { method: "HEAD" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      throw new Error(`Poster not serving an image (${res.status} ${type}): ${s.title}`);
    }
  }
  console.log(`All ${SHOWCASE.length} posters verified (HTTP image/*).`);
}

async function runBatches<T>(items: T[], batch: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += batch) {
    await Promise.all(items.slice(i, i + batch).map(fn));
  }
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
      `  ${s.mode === "lottery" ? "lottery" : "fcfs   "} - ${s.title}` +
        `  -> /releases/${release.id}` +
        (s.claims ? `  (${s.claims} claimed)` : "") +
        (s.entries ? `  (${s.entries} entries)` : ""),
    );
  }

  console.log("Showcase v2 seeded.");
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
