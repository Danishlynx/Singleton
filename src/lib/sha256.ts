/**
 * Browser-side SHA-256 (WebCrypto) — must reproduce the server's
 * sha256Utf8Hex (src/domain/lottery.ts) byte-for-byte; pinned by the parity
 * fixture in tests/unit/lottery.test.ts. Runs in browsers AND under
 * Vitest/Node 20+ (globalThis.crypto.subtle is available in both).
 *
 * Used by the public verify page to re-run the draw entirely client-side:
 * check sha256(seed) === seedHash, score every entry, re-derive winners.
 */

export async function sha256Utf8HexBrowser(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function entryScoreBrowser(seed: string, entryId: string): Promise<string> {
  return sha256Utf8HexBrowser(`${seed}:${entryId}`);
}

export interface BrowserScoredEntry {
  id: string;
  score: string;
}

/** Client-side winner re-derivation — same (score asc, id asc) order as the server. */
export async function deriveWinnersBrowser(
  seed: string,
  entryIds: readonly string[],
  capacity: number,
): Promise<BrowserScoredEntry[]> {
  const scored = await Promise.all(
    entryIds.map(async (id) => ({ id, score: await entryScoreBrowser(seed, id) })),
  );
  return scored
    .sort((a, b) => {
      if (a.score < b.score) return -1;
      if (a.score > b.score) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    })
    .slice(0, capacity);
}
