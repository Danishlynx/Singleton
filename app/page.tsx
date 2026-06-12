import Image from "next/image";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Hero } from "@/components/v0/hero";
import { Principles } from "@/components/v0/principles";
import { Pricing } from "@/components/pricing";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listReleases, getReleaseState, type ReleaseState } from "@/db/releases";
import { getReleaseMetaMap, type ReleaseMeta } from "@/db/release-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListedRelease = ReleaseState & { meta: ReleaseMeta | null };

async function loadReleases(): Promise<ListedRelease[] | null> {
  try {
    const releases = await listReleases();
    const shown = releases.slice(0, 12);
    const [states, metas] = await Promise.all([
      Promise.all(shown.map((r) => getReleaseState(r.id))),
      getReleaseMetaMap(shown.map((r) => r.id)),
    ]);
    return states
      .filter((s): s is ReleaseState => Boolean(s))
      .map((s) => ({ ...s, meta: metas.get(s.releaseId) ?? null }));
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

        <section className="mx-auto max-w-5xl space-y-4 px-6 pb-24">
          <h2 className="text-lg font-medium tracking-tight">Live releases</h2>
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
                        <Image
                          src={s.meta.imageUrl}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 100vw, 480px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className="h-10 w-full bg-gradient-to-r from-primary/10 via-accent to-primary/5"
                        aria-hidden="true"
                      />
                    )}
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{s.title}</CardTitle>
                        <div className="flex shrink-0 gap-1.5">
                          {s.mode === "lottery" && (
                            <Badge variant="secondary" className="rounded-full">
                              lottery
                            </Badge>
                          )}
                          <Badge
                            variant={s.remaining > 0 ? "default" : "secondary"}
                            className="rounded-full"
                          >
                            {s.remaining > 0 ? "Open" : "Sold out"}
                          </Badge>
                        </div>
                      </div>
                      <CardDescription className="tabular-nums">
                        {s.mode === "lottery"
                          ? `${s.entrantCount ?? 0} entries · ${s.capacity} slots`
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
