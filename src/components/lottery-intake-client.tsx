"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Clock, Loader2, ShieldCheck, Ticket, Users } from "lucide-react";
import type { ReleaseStateDTO } from "@/components/intake-client";

/**
 * Mode B intake: enter the window, watch the entrant count, see the fairness
 * commitment, and — after the draw — an honest selected / not-selected result.
 * No urgency theatrics: entering early gives no advantage, and the UI says so.
 */

type Phase = "idle" | "entering" | "entered";

interface EntryResult {
  drawn: boolean;
  selected: boolean | null;
  allocationId: string | null;
}

function storageKey(releaseId: string): string {
  return `singleton_entry_${releaseId}`;
}

function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

export function LotteryIntakeClient({ initial }: { initial: ReleaseStateDTO }) {
  const [state, setState] = useState<ReleaseStateDTO>(initial);
  const [now, setNow] = useState<number>(() => Date.parse(initial.opensAt) - 1);
  const [claimantId, setClaimantId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [result, setResult] = useState<EntryResult | null>(null);
  const resultRequested = useRef(false);

  const opensAt = Date.parse(state.opensAt);
  const closesAt = state.entryClosesAt ? Date.parse(state.entryClosesAt) : Number.NaN;

  // Restore a previous entry for this release (the participant's proof handle).
  useEffect(() => {
    const stored = localStorage.getItem(storageKey(initial.releaseId));
    if (stored) {
      setEntryId(stored);
      setPhase("entered");
    }
  }, [initial.releaseId]);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/releases/${initial.releaseId}/state`, { cache: "no-store" });
      if (res.ok) setState((await res.json()) as ReleaseStateDTO);
    } catch {
      /* transient; keep last good state */
    }
  }, [initial.releaseId]);

  useEffect(() => {
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [poll]);

  // Once drawn, resolve this participant's result from their entryId. `state`
  // is in the dependency list so each poll tick re-runs the effect, letting a
  // failed fetch (HTTP error OR network error) retry until it succeeds.
  useEffect(() => {
    if (!state.drawn || !entryId || resultRequested.current) return;
    resultRequested.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/entries/${entryId}`, { cache: "no-store" });
        if (res.ok) {
          setResult((await res.json()) as EntryResult);
        } else {
          resultRequested.current = false; // HTTP error — retry on next poll tick
        }
      } catch {
        resultRequested.current = false; // network error — retry on next poll tick
      }
    })();
  }, [state, entryId]);

  const windowOpen =
    state.status === "open" && !state.drawn && opensAt <= now && now < closesAt;

  async function doEnter() {
    const id = claimantId.trim();
    if (!id) {
      toast.error("Enter an email or name to join the draw.");
      return;
    }
    setPhase("entering");
    try {
      const res = await fetch(`/api/releases/${initial.releaseId}/enter`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimantId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        entryId?: string;
        alreadyEntered?: boolean;
      };
      if (res.ok && data.status === "entered" && data.entryId) {
        localStorage.setItem(storageKey(initial.releaseId), data.entryId);
        setEntryId(data.entryId);
        setPhase("entered");
        void poll();
        toast.success(
          data.alreadyEntered ? "You were already in the draw." : "You're in the draw.",
          { description: "Every entry in the window has equal odds." },
        );
        return;
      }
      setPhase("idle");
      if (data.status === "window_closed" || data.status === "closed") {
        toast("The entry window has closed.");
        void poll();
      } else if (data.status === "not_open") {
        toast("This draw hasn't opened yet.");
      } else {
        toast.error("Could not enter the draw. Please try again.");
      }
    } catch {
      setPhase("idle");
      toast.error("Network error. Please try again.");
    }
  }

  // ---------- Post-draw render ----------
  if (state.drawn) {
    return (
      <div className="space-y-5">
        {result?.selected && result.allocationId ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 text-center">
            <Check className="mx-auto size-6 text-primary" />
            <h3 className="mt-2 font-medium">You were selected</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your entry was drawn from {state.entrantCount} entrants.
            </p>
            <Button asChild className="mt-4 w-full">
              <Link href={`/receipt/${result.allocationId}`}>View your receipt</Link>
            </Button>
          </div>
        ) : result && result.selected === false ? (
          <div className="rounded-lg border bg-muted/40 p-5 text-center">
            <h3 className="font-medium">Not selected this time</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.capacity} of {state.entrantCount} entries were drawn. Your odds were the
              same as everyone else&apos;s — you can verify that below.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/40 p-5 text-center">
            <h3 className="font-medium">The draw has run</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {Math.min(state.capacity, state.entrantCount ?? 0)} of {state.entrantCount} entries
              were selected.
            </p>
          </div>
        )}
        <Button asChild variant="secondary" className="w-full">
          <Link href={`/verify/${initial.releaseId}`}>
            <ShieldCheck className="size-4" /> Verify the draw — re-run it yourself
          </Link>
        </Button>
        {entryId && (
          <p className="text-center text-xs text-muted-foreground">
            Your entry id: <span className="font-mono">{entryId}</span>
          </p>
        )}
      </div>
    );
  }

  // ---------- Pre-draw render ----------
  return (
    <div className="space-y-6">
      {/* Entrants + window */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Entries in the draw</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {state.capacity} slots to win
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-4xl font-semibold tracking-tight tabular-nums"
            aria-live="polite"
            data-testid="entrant-count"
          >
            {state.entrantCount ?? 0}
          </span>
          <Badge variant={windowOpen ? "default" : "secondary"} className="rounded-full">
            <Users className="size-3" />
            {windowOpen ? "Window open" : now < opensAt ? "Opens soon" : "Window closed"}
          </Badge>
        </div>
      </div>

      {/* Countdown to the draw */}
      {Number.isFinite(closesAt) && now < closesAt && (
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" /> Draw in
          </div>
          <div className="mt-1 text-2xl font-medium tabular-nums" data-testid="draw-countdown">
            {formatCountdown(Math.max(0, closesAt - now))}
          </div>
        </div>
      )}

      {/* Enter */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="claimant">Your email or name</Label>
          <Input
            id="claimant"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={claimantId}
            onChange={(e) => setClaimantId(e.target.value)}
            disabled={phase !== "idle"}
          />
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={doEnter}
          disabled={!windowOpen || phase !== "idle"}
          data-testid="enter-button"
        >
          {phase === "entering" && (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" /> Entering…
            </>
          )}
          {phase === "entered" && (
            <>
              <Check className="size-4" /> You&apos;re in the draw
            </>
          )}
          {phase === "idle" &&
            (windowOpen ? (
              <>
                <Ticket className="size-4" /> Enter the draw
              </>
            ) : now < opensAt ? (
              "Opens soon"
            ) : (
              "Window closed"
            ))}
        </Button>

        {/* That sentence is the product. */}
        <p className="text-center text-xs text-muted-foreground">
          Entering early gives no advantage — every entry in the window has equal odds.
        </p>
      </div>

      {/* Fairness commitment */}
      {state.seedHash && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" />
            Fairness commitment — published before entries opened
          </div>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
            {state.seedHash}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            The draw seed is locked to this hash. After the draw, the seed is revealed and{" "}
            <Link className="underline underline-offset-4" href={`/verify/${initial.releaseId}`}>
              anyone can re-run the draw
            </Link>{" "}
            to confirm the winners.
          </p>
        </div>
      )}
    </div>
  );
}
