"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Check, Clock, Loader2, ShieldCheck } from "lucide-react";

export interface ReleaseStateDTO {
  releaseId: string;
  title: string;
  capacity: number;
  remaining: number;
  allocated: number;
  status: "scheduled" | "open" | "closed";
  opensAt: string;
  isOpen: boolean;
  // Mode B (additive): present when the release is a windowed lottery.
  mode?: "fcfs" | "lottery";
  entrantCount?: number;
  entryClosesAt?: string;
  drawn?: boolean;
  seedHash?: string;
}

type Phase = "idle" | "claiming" | "retrying" | "secured" | "sold_out";

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

function waitlistKey(releaseId: string): string {
  return `singleton_waitlist_${releaseId}`;
}

export function IntakeClient({ initial }: { initial: ReleaseStateDTO }) {
  const router = useRouter();
  const [state, setState] = useState<ReleaseStateDTO>(initial);
  const [now, setNow] = useState<number>(() => Date.parse(initial.opensAt) - 1); // SSR-stable-ish
  const [claimantId, setClaimantId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [waitlistPos, setWaitlistPos] = useState<number | null>(null);
  const idemRef = useRef<Map<string, string>>(new Map());

  const opensAtMs = Date.parse(state.opensAt);

  // Tick the clock (drives the countdown) — only on the client.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Restore a previous waitlist membership for this release: refresh/back must
  // not erase the one thing the sold-out visitor has to hold onto.
  useEffect(() => {
    const stored = localStorage.getItem(waitlistKey(initial.releaseId));
    if (stored) {
      const pos = Number(stored);
      setWaitlistPos(Number.isFinite(pos) && pos > 0 ? pos : null);
      setPhase("sold_out");
    }
  }, [initial.releaseId]);

  // Poll live state so every viewer sees the same remaining count (strong consistency).
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

  const isOpen = state.status === "open" && opensAtMs <= now;
  const soldOut = state.remaining <= 0;
  const pct = state.capacity > 0 ? (state.allocated / state.capacity) * 100 : 0;

  function idempotencyKeyFor(id: string): string {
    const map = idemRef.current;
    let key = map.get(id);
    if (!key) {
      key = crypto.randomUUID();
      map.set(id, key);
    }
    return key;
  }

  async function doClaim() {
    const id = claimantId.trim();
    if (!id) {
      toast.error("Enter an email or name to claim your slot.");
      return;
    }
    const idempotencyKey = idempotencyKeyFor(id);
    const maxClientRetries = 4;

    for (let attempt = 0; attempt <= maxClientRetries; attempt++) {
      setPhase(attempt === 0 ? "claiming" : "retrying");
      let res: Response;
      try {
        res = await fetch(`/api/releases/${initial.releaseId}/claim`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ claimantId: id, idempotencyKey }),
        });
      } catch {
        setPhase("idle");
        toast.error("Network error. Please try again.");
        return;
      }

      if (res.status === 503) {
        // High contention — the server asks us to retry. Brief calm pause.
        await new Promise((r) => setTimeout(r, 500 + attempt * 250));
        continue;
      }

      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        allocationId?: string;
        opensAt?: string;
        position?: number | null;
      };

      if (res.ok && data.status === "allocated" && data.allocationId) {
        setPhase("secured");
        void poll();
        router.push(`/receipt/${data.allocationId}`);
        return;
      }
      if (data.status === "sold_out") {
        setPhase("sold_out");
        const pos = typeof data.position === "number" ? data.position : null;
        setWaitlistPos(pos);
        localStorage.setItem(waitlistKey(initial.releaseId), String(pos ?? 0));
        void poll();
        toast("All slots are taken — you're on the waitlist.", {
          description: "We'll honor first-come order if a slot frees up.",
        });
        return;
      }
      if (data.status === "not_open") {
        setPhase("idle");
        toast("This release hasn't opened yet.");
        void poll();
        return;
      }
      setPhase("idle");
      toast.error("Could not complete the claim. Please try again.");
      return;
    }

    setPhase("idle");
    toast.error("It's very busy right now. Please try once more.");
  }

  return (
    <div className="space-y-6">
      {/* Live remaining */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="micro-label text-muted-foreground">Slots remaining</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {state.allocated} of {state.capacity} claimed
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-5xl font-semibold tracking-[-0.03em] tabular-nums"
            aria-live="polite"
            data-testid="remaining-count"
          >
            {state.remaining}
          </span>
          <Badge variant={soldOut ? "secondary" : "default"} className="rounded-full">
            {soldOut ? "Sold out" : isOpen ? "Open" : "Opens soon"}
          </Badge>
        </div>
        <Progress value={pct} aria-label="Share of slots claimed" />
      </div>

      {/* Pre-open countdown */}
      {!isOpen && state.status !== "closed" && (
        <div className="rounded-xl border border-dashed bg-card p-4">
          <div className="micro-label flex items-center gap-2 text-muted-foreground">
            <Clock className="size-3.5" /> Opens in
          </div>
          <div className="mt-1.5 font-mono text-2xl font-medium tabular-nums" data-testid="countdown">
            {formatCountdown(Math.max(0, opensAtMs - now))}
          </div>
        </div>
      )}

      {/* Claim */}
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
            disabled={phase === "claiming" || phase === "retrying" || phase === "secured"}
          />
        </div>

        <Button
          className="h-11 w-full"
          size="lg"
          onClick={doClaim}
          // Sold out must NOT disable the button — clicking it joins the fair
          // waitlist (the claim API returns sold_out + waitlisted). It disables
          // only once this visitor has joined (phase === "sold_out").
          disabled={
            !isOpen ||
            phase === "claiming" ||
            phase === "retrying" ||
            phase === "secured" ||
            phase === "sold_out"
          }
          data-testid="claim-button"
        >
          {phase === "claiming" && (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" /> Securing your slot…
            </>
          )}
          {phase === "retrying" && (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" /> Busy — retrying fairly…
            </>
          )}
          {phase === "secured" && (
            <>
              <Check className="size-4" /> Secured
            </>
          )}
          {phase === "sold_out" && (
            <>
              <Check className="size-4" /> You&apos;re on the waitlist
            </>
          )}
          {phase === "idle" &&
            (soldOut ? "Join the waitlist" : isOpen ? "Claim a slot" : "Opens soon")}
        </Button>

        {phase === "sold_out" && (
          <div className="rounded-xl border border-dashed bg-card p-4 text-center text-sm">
            <p className="font-medium">
              You&apos;re on the waitlist{waitlistPos ? ` — position #${waitlistPos}` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">
              First-come order is honored if a slot frees up. This stays here when you come back.
            </p>
          </div>
        )}

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          First-come order, one slot per person, verifiable receipt.
        </p>
        {state.status === "closed" && (
          <p className="text-center text-sm text-muted-foreground">This release has closed.</p>
        )}
        <p className="text-center text-xs text-muted-foreground">
          <Link className="underline underline-offset-4" href={`/verify/${initial.releaseId}`}>
            View the public ledger
          </Link>
        </p>
      </div>
    </div>
  );
}
