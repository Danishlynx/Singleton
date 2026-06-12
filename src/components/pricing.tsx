import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

/**
 * The monetization surface: who pays and for what. Deliberately a pricing PAGE,
 * not a payment flow — the hackathon judges (and the rules) require free,
 * unrestricted testing access, and the product thesis is that providers pay for
 * defensible fairness, billed per release. No dark patterns here either.
 */

const TIERS = [
  {
    name: "Per release",
    price: "$49",
    cadence: "per release",
    blurb: "For a single drop: a clinic block, one on-sale, one launch.",
    features: ["Up to 1,000 slots", "FCFS or lottery mode", "Public verify ledger", "Burst-tested"],
  },
  {
    name: "Growth",
    price: "$299",
    cadence: "per month",
    blurb: "For teams running recurring releases.",
    features: [
      "Unlimited releases",
      "Up to 25,000 slots / month",
      "Draw proofs + receipts API",
      "Priority support",
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "annual",
    blurb: "Multi-region, custom identity hooks, SLAs.",
    features: [
      "Active-active multi-region",
      "Custom claimant identity / bot defense hooks",
      "Audit exports",
      "99.9% SLA",
    ],
  },
];

export function Pricing() {
  return (
    <section className="mx-auto max-w-5xl space-y-6 px-6 pb-24">
      <div className="space-y-1.5 border-t pt-6">
        <h2 className="text-lg font-semibold tracking-tight">Pricing for providers</h2>
        <p className="text-sm text-muted-foreground">
          Claimants never pay Singleton. Providers pay for allocation they can defend in public,
          because &ldquo;verify it yourself&rdquo; is a better answer than &ldquo;trust us.&rdquo;
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => (
          <Card
            key={t.name}
            className={t.highlight ? "border-primary/40 shadow-none" : "shadow-none"}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="micro-label text-muted-foreground">{t.name}</CardTitle>
                {t.highlight && (
                  <Badge className="rounded-full" variant="default">
                    Most common
                  </Badge>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 pt-1">
                <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
                  {t.price}
                </span>
                <span className="text-sm text-muted-foreground">{t.cadence}</span>
              </div>
              <p className="text-sm text-muted-foreground">{t.blurb}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 border-t border-dashed pt-4 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Demo pricing: billing is intentionally not wired in this build, and the judges&apos;
        testing access stays free and unrestricted.
      </p>
    </section>
  );
}
