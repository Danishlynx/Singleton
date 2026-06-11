import { test, expect, request as pwRequest } from "@playwright/test";
import { randomUUID } from "node:crypto";

const ADMIN = process.env.ADMIN_TOKEN ?? "";

async function createRelease(
  baseURL: string,
  opts: { title: string; capacity: number; shardCount?: number },
): Promise<string> {
  const ctx = await pwRequest.newContext({ baseURL });
  const res = await ctx.post("/api/releases", {
    headers: { "x-admin-token": ADMIN },
    data: {
      title: opts.title,
      capacity: opts.capacity,
      shardCount: opts.shardCount ?? 8,
      // open a few seconds in the past so the claim button is enabled on load
      opensAt: new Date(Date.now() - 5_000).toISOString(),
    },
  });
  if (!res.ok()) throw new Error(`create release failed: ${res.status()} ${await res.text()}`);
  const json = (await res.json()) as { release: { id: string } };
  await ctx.dispose();
  return json.release.id;
}

async function claimViaApi(baseURL: string, releaseId: string, claimantId: string) {
  const ctx = await pwRequest.newContext({ baseURL });
  const res = await ctx.post(`/api/releases/${releaseId}/claim`, {
    data: { claimantId, idempotencyKey: randomUUID() },
  });
  await ctx.dispose();
  return res;
}

test.describe("claim flow (real DSQL)", () => {
  test.skip(!ADMIN, "requires ADMIN_TOKEN + a live DSQL cluster");

  test("claim → receipt with rank → public ledger", async ({ page, baseURL }) => {
    const id = await createRelease(baseURL!, { title: "E2E claim", capacity: 5 });

    await page.goto(`/releases/${id}`);
    await expect(page.getByTestId("remaining-count")).toHaveText("5");

    await page.getByLabel(/email or name/i).fill("e2e@example.com");
    await page.getByTestId("claim-button").click();

    await page.waitForURL(/\/receipt\//);
    await expect(page.getByText("#1")).toBeVisible();

    await page.getByRole("link", { name: /verify on the public ledger/i }).click();
    await page.waitForURL(/\/verify\//);
    await expect(page.getByText(/1 of 5 slots allocated/i)).toBeVisible();
    await expect(page.getByText(/Verified/)).toBeVisible();
  });

  test("sold out → fair waitlist", async ({ page, baseURL }) => {
    const id = await createRelease(baseURL!, { title: "E2E sold out", capacity: 1, shardCount: 1 });
    const first = await claimViaApi(baseURL!, id, "first@example.com");
    expect(first.ok()).toBeTruthy();

    await page.goto(`/releases/${id}`);
    await expect(page.getByTestId("remaining-count")).toHaveText("0");

    await page.getByLabel(/email or name/i).fill("late@example.com");
    await page.getByTestId("claim-button").click();
    // Button flips to the joined state (toast also confirms, but the button is unambiguous).
    await expect(page.getByTestId("claim-button")).toContainText(/on the waitlist/i);
  });

  test("cross-tab live count consistency (strong consistency)", async ({ browser, baseURL }) => {
    const id = await createRelease(baseURL!, {
      title: "E2E cross-tab",
      capacity: 10,
      shardCount: 4,
    });

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    await a.goto(`/releases/${id}`);
    await b.goto(`/releases/${id}`);
    await expect(a.getByTestId("remaining-count")).toHaveText("10");
    await expect(b.getByTestId("remaining-count")).toHaveText("10");

    // Claim one slot in tab A.
    await a.getByLabel(/email or name/i).fill("crosstab@example.com");
    await a.getByTestId("claim-button").click();
    await a.waitForURL(/\/receipt\//);

    // Tab B (still on intake) must converge to the same remaining via polling.
    await expect(b.getByTestId("remaining-count")).toHaveText("9", { timeout: 6_000 });

    await ctxA.close();
    await ctxB.close();
  });
});
