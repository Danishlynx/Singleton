// Smoke check: verify the /admin?token=... judge magic link signs in (real browser).
// Usage: node scripts/check-magic-link.mjs            (against localhost:3000)
//        CHECK_BASE_URL=https://your.vercel.app node scripts/check-magic-link.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const base = process.env.CHECK_BASE_URL ?? "http://localhost:3000";
const token =
  process.env.CHECK_ADMIN_TOKEN ??
  readFileSync(".env.local", "utf8").match(/^ADMIN_TOKEN=(.+)$/m)?.[1]?.trim();
if (!token) throw new Error("ADMIN_TOKEN not found (.env.local or CHECK_ADMIN_TOKEN)");

const browser = await chromium.launch();
const page = await browser.newPage();

// 1) Magic link → should land signed-in (create form visible, no gate).
await page.goto(`${base}/admin?token=${encodeURIComponent(token)}`);
await page.waitForLoadState("networkidle");
const gateVisible = await page.getByText("Admin access").isVisible().catch(() => false);
const createVisible = await page.getByText("Create a release").isVisible().catch(() => false);
const url = page.url();

// 2) Reload plain /admin in the same context → token persisted in localStorage.
await page.goto(`${base}/admin`);
await page.waitForLoadState("networkidle");
const persisted = await page.getByText("Create a release").isVisible().catch(() => false);

console.log(JSON.stringify({ gateVisible, createVisible, urlAfter: url, persisted }, null, 2));
await browser.close();
