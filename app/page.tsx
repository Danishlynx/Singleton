import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Hero } from "@/components/v0/hero";
import { Principles } from "@/components/v0/principles";
import { Pricing } from "@/components/pricing";
import { RefreshWhenStale } from "@/components/refresh-when-stale";
import { ReleasesBrowser } from "@/components/releases-browser";
import { listReleaseStates, type ReleaseListing } from "@/db/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadReleases(): Promise<ReleaseListing[] | null> {
  try {
    // Batched: two DB round trips total regardless of release count (incl. branding).
    // Pull the full set so the client-side filters operate over everything, not a page.
    return await listReleaseStates(100);
  } catch {
    return null; // database not configured / unreachable
  }
}

export default async function Home() {
  const releases = await loadReleases();

  return (
    <>
      <RefreshWhenStale renderedAt={Date.now()} />
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
            <ReleasesBrowser releases={releases} />
          )}
        </section>

        <Pricing />
      </main>
      <SiteFooter />
    </>
  );
}
