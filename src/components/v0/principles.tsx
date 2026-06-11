// Scaffolded with v0 (v0 Max): https://v0.app/chat/singleton-landing-page-pqMkmiIqurO
// Imported from the v0 export (components/principles.tsx).
// Adaptations from the original: v0's `brand` color token mapped to our `primary`.
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
      <ul className="grid gap-6 md:grid-cols-3">
        {principles.map(({ icon: Icon, title, description }) => (
          <li key={title}>
            <Card className="h-full border-border/70 shadow-none">
              <CardHeader className="gap-4">
                <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <CardTitle className="text-lg font-medium">{title}</CardTitle>
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
