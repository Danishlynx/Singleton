// Scaffolded with v0 (v0 Max): https://v0.app/chat/singleton-landing-page-pqMkmiIqurO
// Imported from the v0 export (components/hero.tsx).
// Adaptations from the original: v0's `brand` color token mapped to our `primary`
// (the theme's single indigo accent), and the Base-UI-style `render` prop converted
// to our Radix button's `asChild` API.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 pt-20 pb-10 md:items-center md:pt-28 md:text-center">
      <Badge
        variant="secondary"
        className="gap-2 rounded-full px-3 py-1 font-normal text-muted-foreground"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
        Amazon Aurora DSQL · strongly consistent
      </Badge>

      <h1 className="text-pretty text-4xl font-semibold leading-tight tracking-tight text-balance md:text-5xl md:leading-[1.1]">
        Fair, no-oversell allocation of scarce slots.
      </h1>

      <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
        Singleton releases a fixed batch of slots to a crowd and guarantees every claim is
        correct, first-come fair, and independently verifiable — one ordinary ACID transaction,
        no blockchain.
      </p>

      <Button size="lg" className="mt-2 gap-2" asChild>
        <Link href="/admin">
          Create a release
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </section>
  );
}
