import "./load-env";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { query } from "@/db/query";
import { closePools } from "@/db/pool";
import {
  isAsyncIndexStatement,
  parseAsyncIndexName,
  splitSqlStatements,
  waitForIndexValid,
} from "@/db/migrate-helpers";

/**
 * Aurora DSQL migration runner.
 *
 * DSQL constraints honored here:
 *   - one DDL statement per transaction, no DDL+DML mixing => every statement is
 *     issued on its own (pool.query autocommits each as its own transaction);
 *   - CREATE INDEX ASYNC is non-blocking + eventually-valid => after issuing one we
 *     poll pg_index.indisvalid until the index is valid before continuing;
 *   - migrations are recorded in schema_migrations (bootstrapped here) and skipped
 *     on re-run, so the runner is idempotent.
 *
 * Always targets the primary endpoint (a peered multi-region pair is one logical DB,
 * so migrating once suffices); cross-region failover is disabled for determinism.
 */

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");
const noFailover = { failover: false } as const;

async function ensureMigrationsTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename   text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
    [],
    noFailover,
  );
}

async function appliedSet(): Promise<Set<string>> {
  const rows = await query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
    [],
    noFailover,
  );
  return new Set(rows.map((r) => r.filename));
}

async function main(): Promise<void> {
  console.log("==> Running migrations against Aurora DSQL ...");
  await ensureMigrationsTable();
  const applied = await appliedSet();

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    console.log("    (no migration files found)");
    return;
  }

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`    - ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    const statements = splitSqlStatements(sql);
    console.log(`    - ${file}: ${statements.length} statement(s)`);

    for (const stmt of statements) {
      await query(stmt, [], noFailover); // own transaction (one DDL per txn)
      if (isAsyncIndexStatement(stmt)) {
        const name = parseAsyncIndexName(stmt);
        if (name) {
          process.stdout.write(`        waiting for index ${name} to become valid ... `);
          await waitForIndexValid((s, p) => query<{ indisvalid: boolean }>(s, p, noFailover), name);
          console.log("valid");
        }
      }
    }

    await query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file], noFailover);
    console.log(`      applied ${file}`);
  }

  console.log("==> Migrations complete.");
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Migration failed:", err);
    await closePools();
    process.exit(1);
  });
