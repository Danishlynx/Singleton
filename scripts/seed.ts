import "./load-env";
import { createProvider, createRelease } from "@/db/releases";
import { closePools } from "@/db/pool";

/**
 * Seed a demo provider + one OPEN release whose capacity is split across shards.
 * Override with env: SEED_CAPACITY (default 200), SEED_SHARDS (default 32),
 * SEED_TITLE. Each run creates a fresh release (random UUIDs).
 */
async function main(): Promise<void> {
  const capacity = Number(process.env.SEED_CAPACITY ?? 200);
  const shardCount = Number(process.env.SEED_SHARDS ?? 32);
  const title = process.env.SEED_TITLE ?? "Spring vaccination slots";

  const providerId = await createProvider("Demo Clinic");
  const release = await createRelease({
    providerId,
    title,
    capacity,
    shardCount,
    opensAt: new Date(), // open immediately
    status: "open",
  });

  console.log("Seeded demo data:");
  console.log(`  provider : ${providerId}`);
  console.log(
    `  release  : ${release.id}  (capacity ${capacity}, ${shardCount} shards, status ${release.status})`,
  );
  console.log(`  intake   : /releases/${release.id}`);
  console.log(`  verify   : /verify/${release.id}`);
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await closePools();
    process.exit(1);
  });
