// Scaffolded with v0 (v0 Max): https://v0.app/chat/singleton-landing-page-pqMkmiIqurO
// Imported from the v0 export (components/principles.tsx).
// Adaptations from the original: v0's `brand` color token mapped to our `primary`.
// Counterfoil pass: icon tiles replaced with a registry-index row — mono ordinal
// in the accent, hairline rule, quiet icon. The guarantee reads like a document.
import { ShieldCheck, ListChecks, ScrollText, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Principle = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const principles: Principle[] = [
  {
    icon: ShieldCheck,
    title: "Correct",
    description:
      "A fixed batch is split across many counter shards; a single ACID transaction with retry means it can never oversell.",
  },
  {
    icon: ListChecks,
    title: "Fair",
    description:
      "First-come ordering, one slot per person, no line-jumping — enforced by the database, not by hope.",
  },
  {
    icon: ScrollText,
    title: "Verifiable",
    description:
      "Every claimant gets a receipt whose position can be re-checked against an immutable public ledger.",
  },
];

export function Principles() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <ul className="grid gap-4 md:grid-cols-3">
        {principles.map(({ icon: Icon, title, description }, i) => (
          <li key={title}>
            <Card className="h-full gap-3 shadow-none">
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between border-b border-dashed pb-3">
                  <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-accent-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
