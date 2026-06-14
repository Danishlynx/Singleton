"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { TokenGate, SignOutButton, adminFetch } from "@/components/admin/admin-auth";
import type { ReleaseStateDTO } from "@/components/intake-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { normalizeImageUrl } from "@/lib/image-url";

/**
 * Live poster preview: shows exactly what will render publicly, including the
 * share-link normalization, BEFORE the release is created — so a private Drive
 * file or dead URL is caught here instead of on the live intake page.
 */
function PosterPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0); // bump to force a fresh load
  const trimmed = url.trim();
  const normalized = trimmed ? normalizeImageUrl(trimmed) : "";

  useEffect(() => {
    setFailed(false); // a new URL gets a fresh chance
  }, [normalized]);

  if (!trimmed || !trimmed.startsWith("https://")) return null;

  return (
    <div className="space-y-1">
      {failed ? (
        <p className="text-xs text-destructive">
          Couldn&apos;t load that image. Check that the link is a public image (for Drive: shared as
          &ldquo;anyone with the link&rdquo;).{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              // Common sequence: paste link first, make the file public after.
              // Retry re-attempts the same URL with a cache-busting param.
              setAttempt((a) => a + 1);
              setFailed(false);
            }}
          >
            Just shared it? Retry
          </button>
        </p>
      ) : (
        <div className="relative h-28 w-full overflow-hidden rounded-md border">
          {/* Plain <img>: this is a transient admin-side preview of an arbitrary
              remote URL; the optimizer pipeline is exercised on the public pages. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attempt > 0 ? `${normalized}${normalized.includes("?") ? "&" : "?"}r=${attempt}` : normalized}
            alt="Poster preview"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        </div>
      )}
      {normalized !== trimmed && !failed && (
        <p className="text-xs text-muted-foreground">
          Share link detected. It will be stored as the direct image URL.
        </p>
      )}
    </div>
  );
}

function CreateRelease({ token, onCreated }: { token: string; onCreated: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("Spring vaccination slots");
  const [capacity, setCapacity] = useState("200");
  const [shardCount, setShardCount] = useState("32");
  const [opensAt, setOpensAt] = useState("");
  const [mode, setMode] = useState<"fcfs" | "lottery">("fcfs");
  const [entryClosesAt, setEntryClosesAt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (mode === "lottery" && !entryClosesAt) {
      toast.error("A lottery release needs an entry-close time.");
      return;
    }
    if (imageUrl && !imageUrl.startsWith("https://")) {
      toast.error("Image URL must be https://");
      return;
    }
    setBusy(true);
    try {
      const meta = {
        imageUrl: imageUrl.trim() || undefined,
        description: description.trim() || undefined,
        venue: venue.trim() || undefined,
        eventAt: eventAt ? new Date(eventAt).toISOString() : undefined,
      };
      const hasMeta = Object.values(meta).some(Boolean);
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
          meta: hasMeta ? meta : undefined,
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
      // Forward momentum: land on the new release's monitor so the operator can
      // explore it (live stats, run a burst, view the public page) instead of
      // being left staring at the just-submitted form.
      if (data.release?.id) {
        toast.success("Release created — opening its monitor.");
        router.push(`/admin/${data.release.id}`);
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
          <Label htmlFor="opensAt">Opens at (optional, your local time, shown publicly in UTC)</Label>
          <Input
            id="opensAt"
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Allocation mode</Label>
          {/* aria-pressed toggle buttons: honest semantics without needing the
              roving-tabindex/arrow-key contract a radiogroup implies. */}
          <div className="flex gap-2" aria-label="Allocation mode">
            <Button
              type="button"
              variant={mode === "fcfs" ? "default" : "outline"}
              size="sm"
              aria-pressed={mode === "fcfs"}
              onClick={() => setMode("fcfs")}
            >
              First come, first served
            </Button>
            <Button
              type="button"
              variant={mode === "lottery" ? "default" : "outline"}
              size="sm"
              aria-pressed={mode === "lottery"}
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
            <Label htmlFor="entryClosesAt">
              Entry window closes at (draw time, your local time)
            </Label>
            <Input
              id="entryClosesAt"
              type="datetime-local"
              value={entryClosesAt}
              onChange={(e) => setEntryClosesAt(e.target.value)}
              data-testid="entry-closes-at"
            />
          </div>
        )}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="imageUrl">
            Poster image URL <span className="text-muted-foreground">(optional, https)</span>
          </Label>
          <Input
            id="imageUrl"
            inputMode="url"
            placeholder="https://images.example.com/poster.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Google Drive / Dropbox share links are converted automatically. The file must be
            shared as &ldquo;anyone with the link.&rdquo;
          </p>
          <PosterPreview url={imageUrl} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">
            Description <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="description"
            placeholder="One calm sentence about the event or batch."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="venue">
            Venue <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="venue"
            placeholder="City Concert Hall"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eventAt">
            Event date <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="eventAt"
            type="datetime-local"
            value={eventAt}
            onChange={(e) => setEventAt(e.target.value)}
          />
        </div>
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

  if (!loaded) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }
  if (releases.length === 0) {
    return <p className="text-sm text-muted-foreground">No releases yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {releases.map((r) => (
        <Card key={r.releaseId}>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">{r.title}</CardTitle>
              <CardDescription className="font-mono text-xs tabular-nums">
                {r.mode === "lottery"
                  ? `${r.entrantCount ?? 0} ${(r.entrantCount ?? 0) === 1 ? "entry" : "entries"} · ${r.capacity} slots`
                  : `${r.remaining} of ${r.capacity} remaining · ${r.allocated} claimed`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={r.remaining > 0 ? "default" : "secondary"} className="rounded-full">
                {r.mode === "lottery"
                  ? r.drawn
                    ? "Drawn"
                    : Date.parse(r.entryClosesAt ?? "") > Date.now()
                      ? "Window open"
                      : "Awaiting draw"
                  : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
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
