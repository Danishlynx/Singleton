/**
 * Migration helpers (dependency-free pure parsers + an injectable index-validity
 * poller). No DB import, so the parsers are unit-testable in isolation.
 */

/**
 * Split a .sql file into individual statements. Strips `--` line comments and
 * splits on `;`. Our migrations contain no string literals with `;`/`--` and no
 * dollar-quoted bodies (DSQL has no PL/pgSQL), so this simple split is safe.
 */
export function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** True if the statement is a `CREATE [UNIQUE] INDEX ASYNC ...`. */
export function isAsyncIndexStatement(stmt: string): boolean {
  return /\bINDEX\s+ASYNC\b/i.test(stmt);
}

/**
 * Extract the index name from `CREATE [UNIQUE] INDEX ASYNC [IF NOT EXISTS] name ON ...`.
 * Returns null if it is not an async index statement.
 */
export function parseAsyncIndexName(stmt: string): string | null {
  const m = stmt.match(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+ASYNC\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?\s+ON\b/i,
  );
  return m ? m[1] : null;
}

export type RowRunner = (sql: string, params: unknown[]) => Promise<Array<{ indisvalid: boolean }>>;

export interface WaitOptions {
  timeoutMs?: number; // default 120_000
  intervalMs?: number; // default 1_000
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Poll until the named index reports `indisvalid = true`. On DSQL, a `CREATE INDEX
 * ASYNC` is not enforceable until the background build completes; a failed unique
 * build leaves an INVALID index that still rejects duplicate DML, so we surface a
 * clear error (with the DROP hint) rather than proceeding on an invalid index.
 */
export async function waitForIndexValid(
  runQuery: RowRunner,
  indexName: string,
  opts: WaitOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 1_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + timeoutMs;

  for (;;) {
    const rows = await runQuery(
      `SELECT i.indisvalid
         FROM pg_class c
         JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = $1`,
      [indexName],
    );
    if (rows.length > 0 && rows[0].indisvalid === true) return;
    if (now() > deadline) {
      const state = rows.length === 0 ? "index not found" : "still building (indisvalid=false)";
      throw new Error(
        `Index "${indexName}" did not become valid within ${timeoutMs}ms (${state}). ` +
          `A failed async build leaves an INVALID index that still blocks duplicate DML — ` +
          `run \`DROP INDEX ${indexName}\` and retry the migration.`,
      );
    }
    await sleep(intervalMs);
  }
}
