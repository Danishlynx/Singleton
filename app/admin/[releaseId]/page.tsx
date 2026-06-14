"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { AuthGate, apiFetch, type Credential } from "@/components/admin/admin-auth";
import type { ReleaseStateDTO } from "@/components/intake-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Activity, Loader2, ShieldCheck, Zap } from "lucide-react";

interface SimMetrics {
  capacity: number;
  attempts: number;
  concurrency: number;
  newlyAllocated: number;
  totalAllocated: number;
  soldOut: number;
  retries: number;
  oversells: number;
  remaining: number;
  throughputPerSec: number;
  latencyMs: { p50: number; p95: number; p99: number };
  ranksContiguous: boolean;
  invariantOk: boolean;
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "bad";
}) {
  const color =
    tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      {/* break-words + responsive size: the p50/p95/p99 triple overflows on mobile otherwise */}
      <div className={`mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl ${color}`}>
        {value}
      </div>
    </div>
  );
}

function Monitor({ cred, releaseId }: { cred: Credential; releaseId: string }) {
  const [state, setState] = useState<ReleaseStateDTO | null>(null);
  const [drawing, setDrawing] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/releases/${releaseId}/state`, { cache: "no-store" });
      if (res.ok) setState((await res.json()) as ReleaseStateDTO);
    } catch {
      /* ignore */
    }
  }, [releaseId]);

  useEffect(() => {
    void poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [poll]);

  async function runDraw() {
    setDrawing(true);
    try {
      const res = await apiFetch(cred, `/api/releases/${releaseId}/draw`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        winners?: number;
        entrants?: number;
        error?: string;
      };
      if (res.ok && data.status === "drawn") {
        toast.success(`Draw complete: ${data.winners} winners from ${data.entrants} entries.`);
      } else if (res.ok && data.status === "already_drawn") {
        toast(`Already drawn: ${data.winners} winners from ${data.entrants} entries.`);
      } else if (res.status === 409) {
        toast.error("The entry window hasn't closed yet.");
      } else {
        toast.error(data.error ?? "Draw failed.");
      }
      void poll();
    } finally {
      setDrawing(false);
    }
  }

  if (!state) {
    return <Skeleton className="h-44 w-full rounded-xl" />;
  }
  const pct = state.capacity > 0 ? (state.allocated / state.capacity) * 100 : 0;
  const isLottery = state.mode === "lottery";
  const windowClosed = state.entryClosesAt ? Date.parse(state.entryClosesAt) <= Date.now() : false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{state.title}</CardTitle>
            <CardDescription className="tabular-nums">
              {isLottery
                ? `${state.entrantCount ?? 0} entries · ${state.capacity} slots · ${
                    state.drawn ? "drawn" : windowClosed ? "ready to draw" : "window open"
                  }`
                : `${state.allocated} of ${state.capacity} claimed · ${state.remaining} remaining`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isLottery && (
              <Badge variant="secondary" className="rounded-full">
                lottery
              </Badge>
            )}
            <Badge
              variant={state.remaining > 0 ? "default" : "secondary"}
              className="rounded-full"
            >
              {state.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} aria-label="Share of slots allocated" />
        {isLottery && !state.drawn && (
          <Button
            onClick={runDraw}
            disabled={drawing || !windowClosed}
            className="w-full"
            data-testid="run-draw"
          >
            {drawing ? (
              <>
                <Loader2 className="size-4 motion-safe:animate-spin" /> Drawing…
              </>
            ) : windowClosed ? (
              "Run draw"
            ) : (
              "Run draw (window still open)"
            )}
          </Button>
        )}
        {isLottery && state.drawn && (
          <p className="text-sm text-muted-foreground">
            Draw complete. Winners are on the public ledger with the revealed seed.
          </p>
        )}
        <div className="flex gap-4 text-xs">
          <Link
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            href={`/releases/${releaseId}`}
          >
            View public page
          </Link>
          <Link
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            href={`/verify/${releaseId}`}
          >
            Open public ledger
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function SimulatePanel({ cred, releaseId }: { cred: Credential; releaseId: string }) {
  const [attempts, setAttempts] = useState("500");
  const [concurrency, setConcurrency] = useState("50");
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<SimMetrics | null>(null);

  async function run() {
    setBusy(true);
    try {
      const res = await apiFetch(cred, `/api/releases/${releaseId}/simulate`, {
        method: "POST",
        body: JSON.stringify({ attempts, concurrency }),
      });
      if (res.status === 401) {
        toast.error("Your session expired. Sign in again.");
        return;
      }
      const data = (await res.json()) as SimMetrics & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Burst failed.");
        return;
      }
      setMetrics(data);
      if (data.invariantOk) {
        toast.success(`Guarantee held: 0 oversells across ${data.attempts} attempts.`);
      } else {
        toast.error("Invariant violated. See metrics.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="size-4 text-primary" /> Run a concurrency burst
        </CardTitle>
        <CardDescription>
          Fires many simultaneous claims at this release and proves the no-oversell guarantee live.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="attempts">Attempts</Label>
            <Input
              id="attempts"
              inputMode="numeric"
              value={attempts}
              onChange={(e) => setAttempts(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="concurrency">Concurrency</Label>
            <Input
              id="concurrency"
              inputMode="numeric"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={run} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 motion-safe:animate-spin" /> Running…
                </>
              ) : (
                <>
                  <Activity className="size-4" /> Run burst
                </>
              )}
            </Button>
          </div>
        </div>

        {metrics && (
          <div className="space-y-4">
            <div
              className={`flex items-center gap-3 rounded-lg border p-4 ${
                metrics.invariantOk
                  ? "border-primary/30 bg-primary/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <ShieldCheck
                className={`size-5 ${metrics.invariantOk ? "text-primary" : "text-destructive"}`}
              />
              <span className="text-sm font-medium">
                {metrics.invariantOk
                  ? "Guarantee held: no oversell, ranks contiguous, claimants distinct."
                  : "Invariant violated."}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Oversells"
                value={metrics.oversells}
                tone={metrics.oversells === 0 ? "good" : "bad"}
              />
              <Stat label="Allocated (total)" value={metrics.totalAllocated} />
              <Stat label="Remaining" value={metrics.remaining} />
              <Stat label="OCC retries" value={metrics.retries} />
              <Stat label="Newly allocated" value={metrics.newlyAllocated} />
              <Stat label="Throughput /s" value={metrics.throughputPerSec} />
              <Stat
                label="Latency p50/p95/p99"
                value={`${metrics.latencyMs.p50}/${metrics.latencyMs.p95}/${metrics.latencyMs.p99}`}
              />
              <Stat
                label="Ranks 1..N"
                value={metrics.ranksContiguous ? "OK" : "FAIL"}
                tone={metrics.ranksContiguous ? "good" : "bad"}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminReleasePage({ params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = use(params); // Next 15: unwrap params in a client component

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-12">
        <Link href="/admin" className="text-sm text-muted-foreground underline underline-offset-4">
          ← All releases
        </Link>
        <AuthGate>
          {(cred) => (
            <div className="space-y-6">
              <Monitor cred={cred} releaseId={releaseId} />
              {/* The burst simulator is a platform/demo stress tool, not an
                  operator feature (and the API restricts it to platform). */}
              {cred.kind === "platform" && <SimulatePanel cred={cred} releaseId={releaseId} />}
            </div>
          )}
        </AuthGate>
      </main>
    </>
  );
}
