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
  const bgImage = meta?.imageUrl;

  return (
    <>
      <SiteHeader />
      <main className="relative flex-1 overflow-hidden">
        {/* The event image fills the page behind the card, with a glass veil on
            top: enough blur + opacity that the source image's pixelation/blur is
            no longer perceptible. The card stays solid on top, unchanged. */}
        {bgImage && (
          <div className="absolute inset-0" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bgImage} alt="" className="h-full w-full object-cover" />
            {/* Dark vignette: edges fall off to draw the eye to the glass card
                and add cinematic depth, while the center stays clear photo. */}
            <div className="absolute inset-0 bg-[radial-gradient(125%_125%_at_50%_45%,transparent_42%,rgba(0,0,0,0.55)_100%)]" />
          </div>
        )}
        <div className="relative z-10 mx-auto w-full max-w-lg px-4 py-12">
        <Card className="overflow-hidden border border-white/30 bg-card/70 pt-0 shadow-xl shadow-black/10 ring-1 ring-white/10 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
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
            {/* Back link lives INSIDE the card so it stays legible regardless of
                the background image behind the page. */}
            <div className="mt-5 border-t border-dashed pt-3">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-foreground"
              >
                <Link href="/#releases">
                  <ArrowLeft className="size-4" /> Back to all releases
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
