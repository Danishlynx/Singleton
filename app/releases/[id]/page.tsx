import Link from "next/link";
import { notFound } from "next/navigation";
import { getReleaseState } from "@/db/releases";
import { getReleaseMeta } from "@/db/release-meta";
import { IntakeClient } from "@/components/intake-client";
import { LotteryIntakeClient } from "@/components/lottery-intake-client";
import { PosterImage } from "@/components/poster-image";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // One latency phase: state's internal lookups and the branding row run together.
  const [state, meta] = await Promise.all([getReleaseState(id), getReleaseMeta(id)]);
  if (!state) notFound();
  const isLottery = state.mode === "lottery";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
        <Link
          href="/#releases"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" /> All releases
        </Link>
        <Card className="overflow-hidden pt-0">
          {/* Vendor branding: poster if provided, calm gradient fallback otherwise */}
          {meta?.imageUrl ? (
            <div className="relative h-52 w-full">
              <PosterImage
                src={meta.imageUrl}
                alt={`${state.title} poster`}
                priority
                sizes="(max-width: 512px) 100vw, 512px"
              />
            </div>
          ) : (
            <div
              className="h-24 w-full bg-gradient-to-r from-primary/15 via-accent to-primary/5"
              aria-hidden="true"
            />
          )}

          <CardHeader>
            <CardTitle className="text-xl">{state.title}</CardTitle>
            {(meta?.venue || meta?.eventAt) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {meta.venue && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" /> {meta.venue}
                  </span>
                )}
                {meta.eventAt && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" /> {formatEventDate(meta.eventAt)} UTC
                  </span>
                )}
              </div>
            )}
            <CardDescription>
              {meta?.description ??
                (isLottery
                  ? `A fixed batch of ${state.capacity} slots, drawn fairly from everyone who enters the window.`
                  : `A fixed batch of ${state.capacity} slots, allocated fairly and verifiably.`)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLottery ? (
              <LotteryIntakeClient initial={state} />
            ) : (
              <IntakeClient initial={state} />
            )}
          </CardContent>
        </Card>
        {/* Repeated on purpose: after claiming or entering, the visitor is at
            the bottom of the card and the top link is off-screen. */}
        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link href="/#releases">
            <ArrowLeft className="size-4" /> Back to all releases
          </Link>
        </Button>
      </main>
      <SiteFooter />
    </>
  );
}
