import type { PoolClient, QueryResultRow } from "pg";
import { getPool, type Region } from "@/db/pool";
import { hasSecondaryRegion } from "@/env";

/**
 * Thin typed query layer over the DSQL pool, with optional cross-region failover.
 *
 * Failover applies only to CONNECTION-level errors (endpoint unreachable), never to
 * application or OCC errors — those are handled by the caller / withRetry. Both
 * endpoints of a peered DSQL pair are the same strongly-consistent logical database,
 * so failing a read or an idempotent write over to the other region is safe.
 */

const CONNECTION_ERROR_CODES = new Set<string>([
  // Node socket errors
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ECONNRESET",
  "EPIPE",
  // PostgreSQL connection / admin-shutdown SQLSTATEs
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "57P01",
  "57P02",
  "57P03",
]);

// pg surfaces some socket-level drops as plain Errors with NO code (e.g.
// "Connection terminated unexpectedly" when the server closes mid-flight).
const CONNECTION_ERROR_MESSAGE_RE =
  /connection terminated|connection ended|connection closed|client has encountered a connection error|terminating connection/i;

export function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (typeof e.code === "string" && CONNECTION_ERROR_CODES.has(e.code)) return true;
  return typeof e.message === "string" && CONNECTION_ERROR_MESSAGE_RE.test(e.message);
}

export interface QueryOpts {
  prefer?: Region;
  /** Disable cross-region failover (e.g. when the caller manages it). Default true. */
  failover?: boolean;
}

/** Run a parameterized query and return typed rows, with cross-region failover. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  opts: QueryOpts = {},
): Promise<T[]> {
  const prefer = opts.prefer ?? "primary";
  const allowFailover = opts.failover ?? true;
  try {
    const res = await getPool(prefer).query<T>(text, params);
    return res.rows;
  } catch (err) {
    if (allowFailover && hasSecondaryRegion() && isConnectionError(err)) {
      const fallback: Region = prefer === "primary" ? "secondary" : "primary";
      const res = await getPool(fallback).query<T>(text, params);
      return res.rows;
    }
    // Single-region resilience: a mid-flight socket drop on a READ is safe to
    // retry once on a fresh pooled connection (SELECTs are idempotent). Writes
    // are never blanket-retried here — their idempotency is handled by callers.
    if (isConnectionError(err) && /^\s*select\b/i.test(text)) {
      const res = await getPool(prefer).query<T>(text, params);
      return res.rows;
    }
    throw err;
  }
}

/** Convenience: first row or undefined. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  opts: QueryOpts = {},
): Promise<T | undefined> {
  const rows = await query<T>(text, params, opts);
  return rows[0];
}

/**
 * Check out a dedicated client (for an explicit BEGIN/COMMIT transaction) and run
 * `fn`, always releasing it. If acquiring the connection fails with a connection
 * error and a peered region exists, retry once on the other region. The caller's
 * `fn` owns BEGIN/COMMIT/ROLLBACK and OCC retry (see withRetry).
 */
export async function withConnection<T>(
  fn: (client: PoolClient) => Promise<T>,
  opts: QueryOpts = {},
): Promise<T> {
  const prefer = opts.prefer ?? "primary";
  const allowFailover = opts.failover ?? true;

  async function run(region: Region): Promise<T> {
    // If connect() throws, `client` stays null so the finally skips release() —
    // otherwise a TypeError would mask the original connection error and defeat
    // the failover check below.
    let client: PoolClient | null = null;
    try {
      client = await getPool(region).connect();
      return await fn(client);
    } finally {
      if (client) client.release();
    }
  }

  try {
    return await run(prefer);
  } catch (err) {
    if (allowFailover && hasSecondaryRegion() && isConnectionError(err)) {
      return run(prefer === "primary" ? "secondary" : "primary");
    }
    throw err;
  }
}
