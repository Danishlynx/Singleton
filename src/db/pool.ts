import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import { attachDatabasePool } from "@vercel/functions";
import { getEnv, hasSecondaryRegion } from "@/env";

/**
 * Aurora DSQL connection pool(s) via the official node-postgres connector.
 *
 * The connector (AuroraDSQLPool extends pg.Pool) mints a fresh IAM auth token for
 * EACH new physical connection, auto-discovers the region from the hostname, and
 * recycles connections before DSQL's hard 60-minute connection limit — so there is
 * NO static database password and no token to refresh by hand.
 *
 * We keep module-scope singletons (reused across invocations on Vercel Fluid
 * Compute) and attach each to Vercel's lifecycle so idle connections drain before
 * the instance suspends.
 *
 * OCC retry is owned by the app (src/db/retry.ts) around explicit BEGIN/COMMIT, so
 * the connector's per-call retry is disabled here to avoid double-retry.
 */

export type Region = "primary" | "secondary";

const pools: Partial<Record<Region, AuroraDSQLPool>> = {};

function buildPool(host: string, region: string): AuroraDSQLPool {
  const env = getEnv();
  const pool = new AuroraDSQLPool({
    host, // <id>.dsql.<region>.on.aws — region also auto-parsed from this
    user: env.CLUSTER_USER, // 'admin' => admin IAM token; else regular token
    database: "postgres", // the only database on a DSQL cluster
    region, // pinned explicitly (Vercel can drift AWS_REGION)
    // Small by default for Fluid Compute (one instance shared across invocations);
    // raise via DB_POOL_MAX for the stress harness. DSQL caps connections at
    // 10,000 with a 100/sec connect rate, so a modest pool with reuse is correct.
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    retry: { maxRetries: 0 }, // we own OCC retry at the transaction level
  });

  // Vercel Fluid Compute: keep the instance alive long enough to drain idle
  // connections. attachDatabasePool returns (does not throw) off-Vercel, so a
  // thrown error indicates a real problem (e.g. unsupported pool type) — surface it.
  try {
    attachDatabasePool(pool);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unsupported database pool type")) {
      console.warn("[db] could not attach pool to Vercel lifecycle:", err.message);
    } else {
      console.error("[db] unexpected error attaching pool to Vercel lifecycle:", err);
    }
  }

  // Idle clients can emit async errors; an unhandled 'error' would crash the
  // process. Log and let pg evict the broken client.
  pool.on("error", (err) => {
    console.error(`[db] idle client error on ${region} pool:`, err);
  });

  return pool;
}

/**
 * Return the connection pool for the requested region, lazily constructing it.
 * Falls back to the primary when "secondary" is requested but no peered second
 * endpoint is configured.
 */
export function getPool(prefer: Region = "primary"): AuroraDSQLPool {
  const env = getEnv();
  if (prefer === "secondary" && hasSecondaryRegion()) {
    if (!pools.secondary) {
      pools.secondary = buildPool(env.DSQL_CLUSTER_ENDPOINT_SECONDARY!, env.AWS_REGION_SECONDARY!);
    }
    return pools.secondary;
  }
  if (!pools.primary) {
    pools.primary = buildPool(env.DSQL_CLUSTER_ENDPOINT, env.AWS_REGION);
  }
  return pools.primary;
}

/**
 * Close all pools (used by scripts/tests for a clean exit). Bounded by a timeout
 * so a connection stuck on an abandoned transaction can never hang the process
 * (pool.end() otherwise waits forever for in-flight connections).
 */
export async function closePools(timeoutMs = 5_000): Promise<void> {
  const closeAll = Promise.all(Object.values(pools).map((p) => p?.end().catch(() => undefined)));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([closeAll, timeout]);
  delete pools.primary;
  delete pools.secondary;
}
