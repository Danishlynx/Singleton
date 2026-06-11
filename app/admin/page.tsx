"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { TokenGate, SignOutButton, adminFetch } from "@/components/admin/admin-auth";
import type { ReleaseStateDTO } from "@/components/intake-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowRight, Loader2, Plus } from "lucide-react";

function CreateRelease({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [title, setTitle] = useState("Spring vaccination slots");
  const [capacity, setCapacity] = useState("200");
  const [shardCount, setShardCount] = useState("32");
  const [opensAt, setOpensAt] = useState("");
  const [mode, setMode] = useState<"fcfs" | "lottery">("fcfs");
  const [entryClosesAt, setEntryClosesAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (mode === "lottery" && !entryClosesAt) {
      toast.error("A lottery release needs an entry-close time.");
      return;
    }
    setBusy(true);
    try {
      const res = await adminFetch(token, "/api/releases", {
        method: "POST",
        body: JSON.stringify({
          title,
          capacity,
          shardCount,
          opensAt: opensAt ? new Date(opensAt).toISOString() : undefined,
          lottery:
            mode === "lottery"
              ? { entryClosesAt: new Date(entryClosesAt).toISOString() }
              : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        release?: { id: string };
      };
      if (res.status === 401) {
        toast.error("Invalid admin token.");
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create release.");
        return;
      }
      toast.success("Release created.");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create a release</CardTitle>
        <CardDescription>
          Capacity is split across the shards. Leave “opens at” empty to open immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacity">Capacity</Label>
          <Input
            id="capacity"
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shards">Shard count</Label>
          <Input
            id="shards"
            inputMode="numeric"
            value={shardCount}
            onChange={(e) => setShardCount(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="opensAt">Opens at (optional)</Label>
          <Input
            id="opensAt"
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Allocation mode</Label>
          <div className="flex gap-2" role="radiogroup" aria-label="Allocation mode">
            <Button
              type="button"
              variant={mode === "fcfs" ? "default" : "outline"}
              size="sm"
              role="radio"
              aria-checked={mode === "fcfs"}
              onClick={() => setMode("fcfs")}
            >
              First come, first served
            </Button>
            <Button
              type="button"
              variant={mode === "lottery" ? "default" : "outline"}
              size="sm"
              role="radio"
              aria-checked={mode === "lottery"}
              onClick={() => setMode("lottery")}
              data-testid="mode-lottery"
            >
              Windowed lottery
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "lottery"
              ? "Everyone who enters the window has equal odds; winners are drawn with a commit-reveal seed anyone can verify."
              : "Slots go in arrival order with a verifiable first-come ledger."}
          </p>
        </div>
        {mode === "lottery" && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="entryClosesAt">Entry window closes at (draw time)</Label>
            <Input
              id="entryClosesAt"
              type="datetime-local"
              value={entryClosesAt}
              onChange={(e) => setEntryClosesAt(e.target.value)}
              data-testid="entry-closes-at"
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 motion-safe:animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create release
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReleaseList({ refreshKey }: { refreshKey: number }) {
  const [releases, setReleases] = useState<ReleaseStateDTO[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/releases", { cache: "no-store" });
      const data = (await res.json()) as { releases: ReleaseStateDTO[] };
      setReleases(data.releases ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loaded && releases.length === 0) {
    return <p className="text-sm text-muted-foreground">No releases yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {releases.map((r) => (
        <Card key={r.releaseId}>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">{r.title}</CardTitle>
              <CardDescription className="tabular-nums">
                {r.remaining} of {r.capacity} remaining · {r.allocated} claimed
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={r.remaining > 0 ? "default" : "secondary"} className="rounded-full">
                {r.status}
              </Badge>
              <Button asChild size="sm" variant="secondary">
                <Link href={`/admin/${r.releaseId}`}>
                  Monitor <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <TokenGate>
          {(token) => (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
                <SignOutButton />
              </div>
              <CreateRelease token={token} onCreated={() => setRefreshKey((k) => k + 1)} />
              <section className="space-y-3">
                <h2 className="text-lg font-medium tracking-tight">Releases</h2>
                <ReleaseList refreshKey={refreshKey} />
              </section>
            </div>
          )}
        </TokenGate>
      </main>
    </>
  );
}
