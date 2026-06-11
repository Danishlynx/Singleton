// Render an SVG architecture diagram to PNG via Playwright chromium.
// Usage: node scripts/render-architecture.mjs <input.svg> <output.png> [scale]
// (Devpost wants an image upload; the SVG stays the editable source of truth.)
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [, , input, output, scaleArg] = process.argv;
if (!input || !output) {
  console.error("Usage: node scripts/render-architecture.mjs <input.svg> <output.png> [scale]");
  process.exit(1);
}
const scale = Number(scaleArg ?? 2);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: scale,
});
await page.goto(pathToFileURL(resolve(input)).href);
// Let fonts settle, then capture the full SVG element.
await page.waitForTimeout(300);
const svg = page.locator("svg");
await svg.screenshot({ path: resolve(output) });
await browser.close();
console.log(`rendered ${input} -> ${output} (scale ${scale}x)`);
