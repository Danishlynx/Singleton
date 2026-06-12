// One-off: screenshot key pages of the running app for visual QA.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.SHOOT_BASE_URL ?? "http://localhost:3000";
mkdirSync(".shots", { recursive: true });

const res = await fetch(`${base}/api/releases`);
const { releases } = await res.json();
const fcfs = releases.find((r) => r.mode === "fcfs" && r.remaining > 0);
const lottery = releases.find((r) => r.mode === "lottery");

// Mint a fresh receipt via the API for the receipt page.
const claim = await fetch(`${base}/api/releases/${fcfs.releaseId}/claim`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ claimantId: `shoot-${Date.now()}@example.com`, idempotencyKey: crypto.randomUUID() }),
}).then((r) => r.json());

const shots = [
  ["landing", `${base}/`],
  ["intake-fcfs", `${base}/releases/${fcfs.releaseId}`],
  ["intake-lottery", `${base}/releases/${lottery.releaseId}`],
  ["receipt", `${base}/receipt/${claim.allocationId}`],
  ["verify", `${base}/verify/${lottery.releaseId}`],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
for (const [name, url] of shots) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: `.shots/${name}.png`, fullPage: true });
  console.log(`${name} -> .shots/${name}.png`);
}
await browser.close();
