// Scaffolded with v0 (v0 Max): https://v0.app/chat/singleton-landing-page-pqMkmiIqurO
// Imported from the v0 export (components/hero.tsx).
// Adaptations from the original: v0's `brand` color token mapped to our `primary`
// (the theme's single indigo accent), the Base-UI-style `render` prop converted
// to our Radix button's `asChild` API, and the CTA pair re-pointed after a UX
// audit (public visitors browse releases; admin creation is the secondary path).
// Counterfoil pass: badge becomes a paper pill with a live dot; mono carries the
// technical line; headline gets more presence. One accent, sentence case.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 pt-20 pb-10 md:items-center md:pt-28 md:text-center">
      <Badge
        variant="outline"
        className="h-auto gap-2 rounded-full border-border bg-card px-3.5 py-1.5 font-mono text-[11px] font-normal tracking-[0.06em] text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
        />
        Amazon Aurora DSQL · strongly consistent
      </Badge>

      <h1 className="text-pretty text-4xl font-semibold leading-tight tracking-[-0.025em] text-balance md:text-[3.4rem] md:leading-[1.07]">
        Fair, no-oversell allocation of scarce slots.
      </h1>

      <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
        Singleton releases a fixed batch of slots to a crowd and guarantees every claim is
        correct, first-come fair, and independently verifiable. One ordinary ACID transaction,
        no blockchain.
      </p>

      <div className="mt-2 flex flex-wrap gap-3">
        <Button size="lg" className="h-11 gap-2 px-5" asChild>
          <Link href="/#releases">
            Browse live releases
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button size="lg" variant="outline" className="h-11 bg-card px-5" asChild>
          <Link href="/admin">Create a release</Link>
        </Button>
      </div>
    </section>
  );
}
