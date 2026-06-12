import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Hero } from "@/components/v0/hero";
import { Principles } from "@/components/v0/principles";
import { Pricing } from "@/components/pricing";
import { PosterImage } from "@/components/poster-image";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listReleaseStates, type ReleaseListing } from "@/db/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadReleases(): Promise<ReleaseListing[] | null> {
  try {
    // Batched: two DB round trips total regardless of release count (incl. branding).
    return await listReleaseStates(12);
  } catch {
    return null; // database not configured / unreachable
  }
}

export default async function Home() {
  const releases = await loadReleases();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero + principles scaffolded with v0 — see src/components/v0/ */}
        <Hero />
        <Principles />

        <section id="releases" className="mx-auto max-w-5xl scroll-mt-20 space-y-4 px-6 pb-24">
          <div className="space-y-1.5 border-t pt-6">
            <h2 className="text-lg font-semibold tracking-tight">Live releases</h2>
          </div>
          {releases === null ? (
            <p className="text-sm text-muted-foreground">
              No database connection yet. Set up Aurora DSQL (see the README) and run{" "}
              <code className="rounded bg-muted px-1 py-0.5">npm run seed</code> to create a demo
              release.
            </p>
          ) : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No releases yet.{" "}
              <Link className="underline underline-offset-4" href="/admin">
                Create one in the admin
              </Link>{" "}
              or run <code className="rounded bg-muted px-1 py-0.5">npm run seed</code>.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {releases.map((s) => (
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
                          {/* Lottery lifecycle is window-based, not stock-based —
                              "Sold out"/"Open" would lie once the window closes. */}
                          {s.mode === "lottery" ? (
                            <Badge
                              variant={
                                s.drawn
                                  ? "secondary"
                                  : Date.parse(s.entryClosesAt ?? "") > Date.now()
                                    ? "default"
                                    : "secondary"
                              }
                              className="rounded-full"
                            >
                              {s.drawn
                                ? "Drawn"
                                : Date.parse(s.entryClosesAt ?? "") > Date.now()
                                  ? "Window open"
                                  : "Awaiting draw"}
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
                      <CardDescription className="font-mono text-xs tabular-nums">
                        {s.mode === "lottery"
                          ? `${s.entrantCount ?? 0} ${(s.entrantCount ?? 0) === 1 ? "entry" : "entries"} · ${s.capacity} ${s.capacity === 1 ? "slot" : "slots"}`
                          : `${s.remaining} of ${s.capacity} remaining`}
                        {s.meta?.venue ? ` · ${s.meta.venue}` : ""}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <Pricing />
      </main>
      <SiteFooter />
    </>
  );
}
