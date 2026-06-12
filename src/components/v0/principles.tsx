// Scaffolded with v0 (v0 Max): https://v0.app/chat/singleton-landing-page-pqMkmiIqurO
// Imported from the v0 export (components/principles.tsx).
// Adaptations from the original: v0's `brand` color token mapped to our `primary`.
// Counterfoil pass: icon tiles replaced with a registry-index row.
// Evidence pass: this is the product's core pitch, so each promise now carries a
// rendered proof artifact — a shard meter, a derived-rank ledger strip, and the
// commitment/MATCH mark — plus the real verification numbers from the live
// stress runs. Claims read like a spec sheet, not marketing.
import { ShieldCheck, ListChecks, ScrollText, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Principle = {
  icon: LucideIcon;
  title: string;
  description: string;
  evidence: React.ReactNode;
  proof: string; // the verified one-liner under the artifact
};

/** Mini sharded-counter meter: a few cells consumed, the rest still in stock. */
function ShardMeter() {
  return (
    <div className="space-y-1.5" aria-hidden="true">
      <div className="flex gap-[3px]">
        {Array.from({ length: 16 }).map((_, j) => (
          <span
            key={j}
            className={`h-2.5 flex-1 rounded-[2px] ${
              j < 6 ? "bg-primary/75" : "border border-border bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="font-mono text-[10.5px] tracking-wide text-muted-foreground">
        capacity sharded ×32 · UPDATE … WHERE remaining &gt; 0
      </p>
    </div>
  );
}

/** Mini ledger strip: first three derived ranks with their commit timestamps. */
function LedgerStrip() {
  const rows = [
    ["#1", "09:00:02.114", "c41b9a…"],
    ["#2", "09:00:02.371", "7d20e6…"],
    ["#3", "09:00:02.380", "a98c1d…"],
  ];
  return (
    <div className="font-mono text-[10.5px] leading-[1.45rem] text-muted-foreground" aria-hidden="true">
      {rows.map(([rank, t, id]) => (
        <div key={rank} className="flex items-center justify-between border-b border-dashed border-border last:border-b-0">
          <span className="font-semibold text-foreground">{rank}</span>
          <span>{t}</span>
          <span>{id}</span>
        </div>
      ))}
    </div>
  );
}

/** The commitment → reveal → verdict mark. */
function MatchMark() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="stamp -rotate-2 text-[10px] text-accent-foreground">MATCH</span>
      <p className="font-mono text-[10.5px] leading-snug text-muted-foreground">
        sha256(seed) = 9b2f4e…e617f8 ✓<br />
        winners re-derived in your browser
      </p>
    </div>
  );
}

const principles: Principle[] = [
  {
    icon: ShieldCheck,
    title: "Correct",
    description:
      "A fixed batch is split across many counter shards; a single ACID transaction with retry means it can never oversell.",
    evidence: <ShardMeter />,
    proof: "10,000 concurrent claims → exactly 200 allocated · 0 oversells",
  },
  {
    icon: ListChecks,
    title: "Fair",
    description:
      "First-come ordering, one slot per person, no line-jumping — enforced by the database, not by hope.",
    evidence: <LedgerStrip />,
    proof: "ranks derived from (claimed_at, id) — never stored, never gapped",
  },
  {
    icon: ScrollText,
    title: "Verifiable",
    description:
      "Every claimant gets a receipt whose position can be re-checked against an immutable public ledger.",
    evidence: <MatchMark />,
    proof: "5,000-entry draw re-derived byte-for-byte from the revealed seed",
  },
];

export function Principles() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <div className="mb-8 max-w-2xl space-y-2">
        <p className="micro-label text-accent-foreground">The guarantee</p>
        <h2 className="text-balance text-2xl font-semibold tracking-tight">
          Not marketing claims — database constraints.
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Each promise below is enforced by Amazon Aurora DSQL inside one ACID transaction, and
          each one ships with a public artifact you can re-check yourself.
        </p>
      </div>

      <ul className="grid gap-4 md:grid-cols-3">
        {principles.map(({ icon: Icon, title, description, evidence, proof }, i) => (
          <li key={title}>
            <Card className="h-full gap-3 shadow-none transition-colors hover:border-primary/40">
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between border-b border-dashed pb-3">
                  <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-accent-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-semibold tracking-tight">{title}</CardTitle>
              </CardHeader>
              <CardContent className="flex h-full flex-col gap-4">
                <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
                <div className="perforation mt-auto pt-4">{evidence}</div>
                <p className="font-mono text-[10.5px] font-medium tracking-wide text-accent-foreground">
                  ✓ {proof}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
