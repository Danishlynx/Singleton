import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Hero } from "@/components/v0/hero";
import { Principles } from "@/components/v0/principles";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listReleases, getReleaseState, type ReleaseState } from "@/db/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadReleases(): Promise<ReleaseState[] | null> {
  try {
    const releases = await listReleases();
    const states = await Promise.all(releases.slice(0, 12).map((r) => getReleaseState(r.id)));
    return states.filter((s): s is ReleaseState => Boolean(s));
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
                  <Card className="transition-colors group-hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{s.title}</CardTitle>
                        <Badge
                          variant={s.remaining > 0 ? "default" : "secondary"}
                          className="rounded-full"
                        >
                          {s.remaining > 0 ? "Open" : "Sold out"}
                        </Badge>
                      </div>
                      <CardDescription className="tabular-nums">
                        {s.remaining} of {s.capacity} remaining
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
