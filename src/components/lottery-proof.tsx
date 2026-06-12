"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ShieldCheck } from "lucide-react";
import { sha256Utf8HexBrowser, deriveWinnersBrowser } from "@/lib/sha256";

/**
 * The public draw proof + the "Re-run the draw" button. EVERYTHING here is
 * computed in the visitor's own browser with WebCrypto: the seed commitment
 * check (sha256(seed) === seedHash) and the full winner re-derivation. The
 * payload identifies entries only by their public UUIDs — never claimants.
 */

interface DrawProof {
  releaseId: string;
  seedHash: string;
  seed: string | null;
  entryIds: string[];
  winnerEntryIds: string[] | null;
  capacity: number;
  entrantCount: number;
  drawnAt: string | null;
}

type RerunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "match"; winners: number; ms: number }
  | { kind: "mismatch"; detail: string };

export function LotteryProof({ releaseId }: { releaseId: string }) {
  const [proof, setProof] = useState<DrawProof | null>(null);
  const [commitmentOk, setCommitmentOk] = useState<boolean | null>(null);
  const [rerun, setRerun] = useState<RerunState>({ kind: "idle" });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/releases/${releaseId}/draw-proof`, { cache: "no-store" });
      if (res.ok) setProof((await res.json()) as DrawProof);
    } catch {
      /* transient */
    }
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Verify the commitment in-browser the moment the seed is revealed.
  useEffect(() => {
    if (!proof?.seed) return;
    void (async () => {
      const hash = await sha256Utf8HexBrowser(proof.seed as string);
      setCommitmentOk(hash === proof.seedHash);
    })();
  }, [proof?.seed, proof?.seedHash]);

  async function rerunDraw() {
    if (!proof?.seed || !proof.winnerEntryIds) return;
    setRerun({ kind: "running" });
    const t0 = performance.now();
    try {
      const derived = await deriveWinnersBrowser(proof.seed, proof.entryIds, proof.capacity);
      const derivedIds = derived.map((w) => w.id).sort();
      const stored = [...proof.winnerEntryIds].sort();
      const match =
        derivedIds.length === stored.length && derivedIds.every((id, i) => id === stored[i]);
      if (match) {
        setRerun({
          kind: "match",
          winners: derivedIds.length,
          ms: Math.round(performance.now() - t0),
        });
      } else {
        setRerun({
          kind: "mismatch",
          detail: `derived ${derivedIds.length} winners but they differ from the published set`,
        });
      }
    } catch (err) {
      setRerun({ kind: "mismatch", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!proof) return null;
  const drawn = Boolean(proof.drawnAt);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Draw proof</h2>
        <p className="text-sm text-muted-foreground">
          {drawn
            ? "The seed is revealed. Re-run the entire draw in your own browser."
            : "The draw hasn't run yet. The commitment below locks the seed in advance."}
        </p>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-accent-foreground" />
              Fairness commitment, published before entries opened
            </div>
            <span className="micro-label shrink-0 text-accent-foreground">Sealed</span>
          </div>
          <p className="mt-2 break-all rounded-md border border-dashed bg-muted/50 p-2.5 font-mono text-xs leading-relaxed text-muted-foreground">
            {proof.seedHash}
          </p>
        </div>

        {drawn && proof.seed && (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              Revealed seed
              {commitmentOk !== null && (
                <Badge
                  variant={commitmentOk ? "default" : "destructive"}
                  className="rounded-full"
                >
                  {commitmentOk ? "sha256(seed) = commitment ✓" : "COMMITMENT BROKEN"}
                </Badge>
              )}
            </div>
            <p className="mt-2 break-all rounded-md border border-dashed bg-muted/50 p-2.5 font-mono text-xs leading-relaxed text-muted-foreground">{proof.seed}</p>
          </div>
        )}

        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {proof.entrantCount} entries · {proof.capacity} slots
          {drawn && proof.winnerEntryIds ? ` · ${proof.winnerEntryIds.length} winners drawn` : ""}
        </p>

        {drawn && (
          <div className="space-y-3">
            <Button
              onClick={rerunDraw}
              disabled={rerun.kind === "running"}
              className="h-11 w-full"
              size="lg"
              data-testid="rerun-draw"
            >
              {rerun.kind === "running" ? (
                <>
                  <Loader2 className="size-4 motion-safe:animate-spin" /> Recomputing every
                  entry&apos;s score…
                </>
              ) : (
                <>
                  <Play className="size-4" /> Re-run the draw in your browser
                </>
              )}
            </Button>

            {rerun.kind === "match" && (
              <div
                className="flex items-center gap-4 rounded-xl border border-primary/40 bg-accent/60 p-4"
                data-testid="rerun-result"
              >
                <span className="stamp shrink-0 -rotate-2 text-accent-foreground">MATCH</span>
                <div className="text-sm text-muted-foreground tabular-nums">
                  Your browser re-derived all {rerun.winners} winners from the seed and entry
                  list in {rerun.ms} ms, identical to the published result.
                </div>
              </div>
            )}
            {rerun.kind === "mismatch" && (
              <div
                className="flex items-center gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
                data-testid="rerun-result"
              >
                <span className="stamp shrink-0 -rotate-2 text-destructive">MISMATCH</span>
                <div className="text-sm text-muted-foreground">{rerun.detail}</div>
              </div>
            )}
          </div>
        )}

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">
            Public entry list ({proof.entryIds.length} entry ids)
          </summary>
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-dashed bg-muted/40 p-2.5 font-mono">
            {proof.entryIds.map((id) => (
              <li key={id}>
                {id}
                {proof.winnerEntryIds?.includes(id) ? "  ← winner" : ""}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
