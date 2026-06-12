import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load .env.local so specs (which create releases via the admin API) and the
// web server both see DSQL creds + ADMIN_TOKEN.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * E2E config. The app requires a live DSQL cluster (.env.local), so these tests
 * run once a cluster is provisioned. By default Playwright builds + starts the
 * app itself; set PLAYWRIGHT_BASE_URL to point at an already-running instance.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Sweep the "E2E ..." releases the specs create, so the public landing never
  // accumulates posterless test debris after a run.
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: true,
  // WAN E2E against a real DSQL cluster: individual flows legitimately take
  // 30s+ (the lottery test waits out a 15s entry window), and parallel specs
  // share one server + DB pool — so generous timeout, modest parallelism.
  timeout: 90_000,
  workers: 2,
  forbidOnly: !!process.env.CI,
  // One retry everywhere: WAN flakes (transient socket drops to the cluster)
  // shouldn't fail a run; genuinely broken behavior still fails twice.
  retries: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
