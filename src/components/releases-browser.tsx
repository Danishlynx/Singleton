"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { PosterImage } from "@/components/poster-image";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import type { ReleaseListing } from "@/db/releases";

const DAY = 86_400_000;

type TypeFilter = "all" | "fcfs" | "lottery";
type LocationFilter = "all" | "in-person" | "online";
type DateFilter = "all" | "week" | "month";
type Sort = "newest" | "closing" | "most" | "fewest";

// --- pure derivations over a release listing ---

function isAvailable(r: ReleaseListing, now: number): boolean {
  if ((r.mode ?? "fcfs") === "lottery") {
    return !r.drawn && r.entryClosesAt != null && Date.parse(r.entryClosesAt) > now;
  }
  return r.remaining > 0;
}

function locationOf(r: ReleaseListing): LocationFilter | "unknown" {
  const venue = r.meta?.venue;
  if (!venue) return "unknown";
  return /online/i.test(venue) ? "online" : "in-person";
}

function dateMatches(r: ReleaseListing, bucket: DateFilter, now: number): boolean {
  if (bucket === "all") return true;
  const at = r.meta?.eventAt;
  if (!at) return false;
  const ms = Date.parse(at);
  return bucket === "week" ? ms <= now + 7 * DAY : ms <= now + 30 * DAY;
}

/** Slots left, used for the most/fewest sort (lottery has no live remainder, so
 *  fall back to its total capacity). */
function spotsLeft(r: ReleaseListing): number {
  return (r.mode ?? "fcfs") === "lottery" ? r.capacity : r.remaining;
}

/** Soonest meaningful deadline for the "closing soon" sort. */
function closingAt(r: ReleaseListing): number {
  if ((r.mode ?? "fcfs") === "lottery" && r.entryClosesAt) return Date.parse(r.entryClosesAt);
  if (r.meta?.eventAt) return Date.parse(r.meta.eventAt);
  return Number.POSITIVE_INFINITY;
}

function SegGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            value === o.value
              ? "border-primary bg-primary/10 font-medium text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="micro-label mb-2 text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function ReleasesBrowser({ releases }: { releases: ReleaseListing[] }) {
  const [search, setSearch] = useState("");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [type, setType] = useState<TypeFilter>("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [loc, setLoc] = useState<LocationFilter>("all");
  const [dateBucket, setDateBucket] = useState<DateFilter>("all");
  const [sort, setSort] = useState<Sort>("newest");

  const anyActive =
    search.trim() !== "" ||
    cats.size > 0 ||
    type !== "all" ||
    availableOnly ||
    loc !== "all" ||
    dateBucket !== "all";

  function toggleCat(slug: string) {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function clearAll() {
    setSearch("");
    setCats(new Set());
    setType("all");
    setAvailableOnly(false);
    setLoc("all");
    setDateBucket("all");
  }

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = search.trim().toLowerCase();
    const list = releases.filter((r) => {
      if (q) {
        const hay = `${r.title} ${r.meta?.venue ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (cats.size > 0 && !(r.meta?.category && cats.has(r.meta.category))) return false;
      if (type !== "all" && (r.mode ?? "fcfs") !== type) return false;
      if (availableOnly && !isAvailable(r, now)) return false;
      if (loc !== "all" && locationOf(r) !== loc) return false;
      if (!dateMatches(r, dateBucket, now)) return false;
      return true;
    });

    if (sort === "closing") return [...list].sort((a, b) => closingAt(a) - closingAt(b));
    if (sort === "most") return [...list].sort((a, b) => spotsLeft(b) - spotsLeft(a));
    if (sort === "fewest") return [...list].sort((a, b) => spotsLeft(a) - spotsLeft(b));
    return list; // newest = server order (created_at desc)
  }, [releases, search, cats, type, availableOnly, loc, dateBucket, sort]);

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      {/* Left filter rail */}
      <aside className="w-full shrink-0 space-y-6 md:sticky md:top-20 md:w-56 md:self-start lg:w-60">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search releases"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search releases"
          />
        </div>

        <FilterGroup label="Category">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.slug}
                type="button"
                aria-pressed={cats.has(c.slug)}
                onClick={() => toggleCat(c.slug)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  cats.has(c.slug)
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Type">
          <SegGroup
            value={type}
            onChange={setType}
            options={[
              { value: "all", label: "All" },
              { value: "fcfs", label: "First-come" },
              { value: "lottery", label: "Lottery" },
            ]}
          />
        </FilterGroup>

        <FilterGroup label="Availability">
          <button
            type="button"
            aria-pressed={availableOnly}
            onClick={() => setAvailableOnly((v) => !v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              availableOnly
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Available now
          </button>
        </FilterGroup>

        <FilterGroup label="When">
          <SegGroup
            value={dateBucket}
            onChange={setDateBucket}
            options={[
              { value: "all", label: "Any time" },
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
            ]}
          />
        </FilterGroup>

        <FilterGroup label="Location">
          <SegGroup
            value={loc}
            onChange={setLoc}
            options={[
              { value: "all", label: "Any" },
              { value: "in-person", label: "In-person" },
              { value: "online", label: "Online" },
            ]}
          />
        </FilterGroup>

        {anyActive && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
            <X className="size-3.5" /> Clear filters
          </Button>
        )}
      </aside>

      {/* Results */}
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground tabular-nums">
            {filtered.length} {filtered.length === 1 ? "release" : "releases"}
          </p>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Sort releases"
            >
              <option value="newest">Newest</option>
              <option value="closing">Closing soon</option>
              <option value="most">Most spots</option>
              <option value="fewest">Fewest spots</option>
            </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center">
            <p className="text-sm font-medium">No releases match these filters.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try clearing a filter or two.</p>
            {anyActive && (
              <Button variant="secondary" size="sm" className="mt-4" onClick={clearAll}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((s) => {
              const windowOpen = Date.parse(s.entryClosesAt ?? "") > Date.now();
              const cat = categoryLabel(s.meta?.category);
              return (
                <Link key={s.releaseId} href={`/releases/${s.releaseId}`} className="group">
                  <Card className="overflow-hidden pt-0 transition-colors group-hover:border-primary/50">
                    {s.meta?.imageUrl ? (
                      <div className="relative h-28 w-full">
                        <PosterImage
                          src={s.meta.imageUrl}
                          alt=""
                          sizes="(max-width: 640px) 100vw, 480px"
                        />
                      </div>
                    ) : (
                      <div
                        className="h-10 w-full border-b border-dashed bg-muted/60"
                        aria-hidden="true"
                      />
                    )}
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{s.title}</CardTitle>
                        <div className="flex shrink-0 gap-1.5">
                          {s.mode === "lottery" && (
                            <Badge variant="secondary" className="rounded-full">
                              Lottery
                            </Badge>
                          )}
                          {s.mode === "lottery" ? (
                            <Badge
                              variant={s.drawn ? "secondary" : windowOpen ? "default" : "secondary"}
                              className="rounded-full"
                            >
                              {s.drawn ? "Drawn" : windowOpen ? "Window open" : "Awaiting draw"}
                            </Badge>
                          ) : (
                            <Badge
                              variant={s.remaining > 0 ? "default" : "secondary"}
                              className="rounded-full"
                            >
                              {s.remaining > 0 ? "Open" : "Sold out"}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {cat && (
                        <span className="micro-label text-accent-foreground">{cat}</span>
                      )}
                      <CardDescription className="font-mono text-xs tabular-nums">
                        {s.mode === "lottery"
                          ? `${s.entrantCount ?? 0} ${(s.entrantCount ?? 0) === 1 ? "entry" : "entries"} · ${s.capacity} ${s.capacity === 1 ? "slot" : "slots"}`
                          : `${s.remaining} of ${s.capacity} remaining`}
                        {s.meta?.venue ? ` · ${s.meta.venue}` : ""}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
