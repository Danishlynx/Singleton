import { test, expect, request as pwRequest } from "@playwright/test";

const ADMIN = process.env.ADMIN_TOKEN ?? "";

async function createLotteryRelease(
  baseURL: string,
  opts: { title: string; capacity: number; windowMs: number },
): Promise<string> {
  const ctx = await pwRequest.newContext({ baseURL });
  const res = await ctx.post("/api/releases", {
    headers: { "x-admin-token": ADMIN },
    data: {
      title: opts.title,
      capacity: opts.capacity,
      shardCount: 4,
      opensAt: new Date(Date.now() - 5_000).toISOString(),
      lottery: { entryClosesAt: new Date(Date.now() + opts.windowMs).toISOString() },
    },
  });
  if (!res.ok()) throw new Error(`create lottery release failed: ${res.status()}`);
  const json = (await res.json()) as { release: { id: string } };
  await ctx.dispose();
  return json.release.id;
}

async function enterViaApi(baseURL: string, releaseId: string, claimantId: string) {
  const ctx = await pwRequest.newContext({ baseURL });
  const res = await ctx.post(`/api/releases/${releaseId}/enter`, { data: { claimantId } });
  const json = (await res.json()) as { entryId?: string };
  await ctx.dispose();
  return json.entryId;
}

async function drawViaApi(baseURL: string, releaseId: string) {
  const ctx = await pwRequest.newContext({ baseURL });
  const res = await ctx.post(`/api/releases/${releaseId}/draw`, {
    headers: { "x-admin-token": ADMIN },
  });
  const json = await res.json();
  await ctx.dispose();
  return { status: res.status(), json };
}

test.describe("lottery flow (real DSQL)", () => {
  test.skip(!ADMIN, "requires ADMIN_TOKEN + a live DSQL cluster");

  test("enter window → draw → winner receipt + honest non-winner + verify MATCH", async ({
    page,
    baseURL,
  }) => {
    // Capacity 1 with 2 entrants => exactly one winner and one non-winner.
    const windowMs = 15_000; // generous: page load + UI steps run over WAN RTT
    const windowStarted = Date.now();
    const id = await createLotteryRelease(baseURL!, {
      title: "E2E lottery",
      capacity: 1,
      windowMs,
    });

    // User enters through the real UI.
    await page.goto(`/releases/${id}`);
    await expect(page.getByText(/fairness commitment/i)).toBeVisible();
    await expect(page.getByTestId("entrant-count")).toHaveText("0");
    await page.getByLabel(/email or name/i).fill("ui-entrant@example.com");
    await page.getByTestId("enter-button").click();
    await expect(page.getByTestId("enter-button")).toContainText(/in the draw/i);

    // Second entrant via API; entrant count converges via polling.
    const apiEntryId = await enterViaApi(baseURL!, id, "api-entrant@example.com");
    expect(apiEntryId).toBeTruthy();
    await expect(page.getByTestId("entrant-count")).toHaveText("2", { timeout: 6_000 });

    // Wait out whatever remains of the window, then draw (admin).
    const remaining = windowMs - (Date.now() - windowStarted) + 1_000;
    if (remaining > 0) await page.waitForTimeout(remaining);
    const draw = await drawViaApi(baseURL!, id);
    expect(draw.status).toBe(200);
    expect(draw.json.status).toBe("drawn");
    expect(draw.json.winners).toBe(1);

    // The UI flips to the post-draw result (selected or honest not-selected).
    await expect(
      page.getByText(/you were selected|not selected this time/i),
    ).toBeVisible({ timeout: 10_000 });

    // Verify page: commitment + the in-browser "Re-run the draw" => MATCH.
    await page.goto(`/verify/${id}`);
    await expect(page.getByText(/fairness commitment/i)).toBeVisible();
    await expect(page.getByText(/sha256\(seed\) = commitment/i)).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("rerun-draw").click();
    await expect(page.getByTestId("rerun-result")).toContainText("MATCH", { timeout: 15_000 });

    // Winner receipt shows the lottery copy (find the winner's allocation).
    const winnerEntry = (draw.json.winnerEntryIds as string[] | undefined) ?? null;
    // Resolve via the entry-result endpoint for whichever entry won.
    const ctx = await pwRequest.newContext({ baseURL: baseURL! });
    let allocationId: string | null = null;
    for (const entryId of [apiEntryId]) {
      const r = await ctx.get(`/api/entries/${entryId}`);
      const j = (await r.json()) as { selected: boolean; allocationId: string | null };
      if (j.selected && j.allocationId) allocationId = j.allocationId;
    }
    if (!allocationId) {
      // The UI entrant must have won; pull their entry id from localStorage.
      const uiEntryId = await page.evaluate(
        (rid) => localStorage.getItem(`singleton_entry_${rid}`),
        id,
      );
      const r = await ctx.get(`/api/entries/${uiEntryId}`);
      const j = (await r.json()) as { selected: boolean; allocationId: string | null };
      allocationId = j.allocationId;
    }
    await ctx.dispose();
    expect(allocationId).toBeTruthy();
    void winnerEntry;

    await page.goto(`/receipt/${allocationId}`);
    await expect(page.getByText(/you entered the window — selected/i)).toBeVisible();
    await expect(page.getByTestId("receipt-entry-id")).toBeVisible();
  });

  test("enter after the window closes is rejected", async ({ baseURL }) => {
    const id = await createLotteryRelease(baseURL!, {
      title: "E2E closed window",
      capacity: 2,
      windowMs: 1_000,
    });
    await new Promise((r) => setTimeout(r, 1_500));
    const ctx = await pwRequest.newContext({ baseURL: baseURL! });
    const res = await ctx.post(`/api/releases/${id}/enter`, {
      data: { claimantId: "late@example.com" },
    });
    expect(res.status()).toBe(409);
    const json = (await res.json()) as { status?: string };
    expect(json.status).toBe("window_closed");
    await ctx.dispose();
  });
});
