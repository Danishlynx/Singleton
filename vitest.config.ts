import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests hit a real Aurora DSQL cluster (network + OCC retries),
    // so give them generous timeouts. Unit tests finish well under these.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Loads .env.local for integration tests; harmless for unit tests.
    setupFiles: ["./tests/setup.ts"],
    // Integration files share one DB pool; running them in parallel starves the
    // pool under the concurrency tests (50 simultaneous claims) and causes
    // spurious OCC-exhaustion failures. Sequential files keep them deterministic
    // (unit files finish in ms, so the cost is negligible).
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
