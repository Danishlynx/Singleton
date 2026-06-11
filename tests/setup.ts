// Vitest global setup: load local env so integration tests can reach DSQL.
// dotenv does not override already-set vars, so .env.local wins over .env.
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

// Integration tests fire up to 50 concurrent claims; the default 5-connection
// pool starves at that fan-out (especially over WAN RTT). Roomier pool for tests
// only — respects an explicit override.
process.env.DB_POOL_MAX = process.env.DB_POOL_MAX ?? "16";
