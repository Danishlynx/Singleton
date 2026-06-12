import "./load-env";
import { createProvider, createRelease } from "@/db/releases";
import { upsertReleaseMeta } from "@/db/release-meta";
import { insertLotteryConfig } from "@/db/lottery";
import { generateSeed } from "@/domain/lottery";
import { closePools } from "@/db/pool";

/**
 * Showcase seed: a handful of branded demo releases so the landing page reads as
 * a living marketplace (concert FCFS drop, clinic lottery, sneaker drop). Poster
 * images are Unsplash hotlinks (stable CDN URLs, free to use). Safe to run
 * repeatedly — every run creates fresh releases.
 *
 *   npx tsx scripts/seed-showcase.ts
 */

const DAY = 86_400_000;

async function main(): Promise<void> {
  const now = Date.now();

  // --- 1. Concert on-sale: FCFS, the classic ticket drop ---
  const venueCo = await createProvider("Aurora Live Events");
  const concert = await createRelease({
    providerId: venueCo,
    title: "Midnight Frequencies — World Tour",
    capacity: 500,
    shardCount: 32,
    opensAt: new Date(now - 60_000),
    status: "open",
  });
  await upsertReleaseMeta(concert.id, {
    imageUrl:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1200&q=80&auto=format&fit=crop",
    description:
      "500 floor tickets released at once. First come, first served — and provably nothing more than 500.",
    venue: "City Arena, Mumbai",
    eventAt: new Date(now + 30 * DAY),
  });

  // --- 2. Clinic vaccination block: lottery (the fairness flagship) ---
  const clinic = await createProvider("Sunrise Community Clinic");
  const vaccines = await createRelease({
    providerId: clinic,
    title: "Free flu vaccination — Saturday block",
    capacity: 120,
    shardCount: 16,
    opensAt: new Date(now - 60_000),
    status: "open",
  });
  const seed1 = generateSeed();
  await insertLotteryConfig(vaccines.id, new Date(now + 1 * DAY), seed1.seed, seed1.seedHash);
  await upsertReleaseMeta(vaccines.id, {
    imageUrl:
      "https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=1200&q=80&auto=format&fit=crop",
    description:
      "Enter any time before the draw — a bot entering in second one has exactly the same odds as you.",
    venue: "Sunrise Clinic, Hall B",
    eventAt: new Date(now + 3 * DAY),
  });

  // --- 3. Sneaker drop: small-capacity lottery (bot-resistance story) ---
  const brand = await createProvider("Form & Field");
  const sneakers = await createRelease({
    providerId: brand,
    title: "FF-01 'Indigo' — limited drop",
    capacity: 24,
    shardCount: 8,
    opensAt: new Date(now - 60_000),
    status: "open",
  });
  const seed2 = generateSeed();
  await insertLotteryConfig(sneakers.id, new Date(now + 2 * DAY), seed2.seed, seed2.seedHash);
  await upsertReleaseMeta(sneakers.id, {
    imageUrl:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&q=80&auto=format&fit=crop",
    description:
      "24 pairs. The draw seed is already committed below — when it reveals, re-run the draw yourself.",
    venue: "Online — ships worldwide",
  });

  console.log("Showcase seeded:");
  console.log(`  concert  (FCFS 500)    : /releases/${concert.id}`);
  console.log(`  vaccines (lottery 120) : /releases/${vaccines.id}  (draws in 1 day)`);
  console.log(`  sneakers (lottery 24)  : /releases/${sneakers.id}  (draws in 2 days)`);
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Showcase seed failed:", err);
    await closePools();
    process.exit(1);
  });
