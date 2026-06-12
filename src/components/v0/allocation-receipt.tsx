// Scaffolded with v0 (v0 Max): https://v0.app/chat/fair-allocation-receipt-r02sWMCWGhN
// Imported from the v0 export (components/allocation-receipt.tsx).
// Adaptations from the original: the verify anchor uses next/link for client-side nav.
// Counterfoil pass: the receipt is a physical artifact — a punched perforation
// tear-line between the header and the position hero, registry micro-labels,
// mono data rows. Props and content are unchanged; the giant tabular rank
// stays the hero.
import Link from "next/link";
import { CheckCircle, ShieldCheck, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface ReceiptProps {
  releaseTitle: string; // e.g. "Spring vaccination slots"
  rank: number; // e.g. 12
  capacity: number; // e.g. 200
  claimedAt: string; // ISO timestamp, display as UTC
  allocationId: string; // uuid, show truncated + monospace
  verifyHref: string; // link to the public ledger
}

function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function truncateId(id: string): string {
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function AllocationReceipt({
  releaseTitle,
  rank,
  capacity,
  claimedAt,
  allocationId,
  verifyHref,
}: ReceiptProps) {
  const utcLabel = formatUtc(claimedAt);

  return (
    <div className="mx-auto w-full max-w-md drop-shadow-[0_2px_12px_rgba(26,26,28,0.08)]">
      {/* Ticket head */}
      <div className="rounded-t-xl border border-b-0 bg-card px-6 pt-6 pb-5">
        <div className="flex items-center justify-between">
          <span className="micro-label text-muted-foreground">Allocation receipt</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-accent-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
            verified
          </span>
        </div>

        <div className="mt-5 flex items-start gap-3">
          <CheckCircle className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold leading-tight text-balance">
              You secured a slot
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{releaseTitle}</p>
          </div>
        </div>
      </div>

      {/* Perforation: the tear line, punched through both edges */}
      <div className="relative h-6 border-x bg-card" aria-hidden="true">
        <div className="perforation absolute inset-x-6 top-1/2" />
        <div className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full border bg-background" />
        <div className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full border bg-background" />
      </div>

      {/* Hero: position */}
      <section aria-labelledby="position-label" className="border-x bg-card px-6 pt-1 pb-5">
        <h3 id="position-label" className="micro-label text-muted-foreground">
          Your position
        </h3>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-6xl font-semibold tracking-[-0.04em] tabular-nums text-foreground">
            #{rank}
          </span>
          <span className="font-mono text-lg tabular-nums text-muted-foreground">
            of {capacity}
          </span>
        </div>
      </section>

      {/* Details + verify */}
      <div className="rounded-b-xl border border-t-0 bg-card px-6 pb-6">
        <dl className="space-y-3 border-t pt-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Secured at</dt>
            <dd className="text-right font-mono text-[13px] tabular-nums text-foreground">
              {utcLabel} UTC
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Receipt id</dt>
            <dd className="font-mono text-[13px] text-foreground" title={allocationId}>
              {truncateId(allocationId)}
            </dd>
          </div>
        </dl>

        <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-accent-foreground"
            aria-hidden="true"
          />
          <span>
            Your position is derived from an immutable public ledger, so anyone can re-check it
            independently.
          </span>
        </p>

        <Button asChild className="mt-5 h-11 w-full">
          <Link href={verifyHref} className="inline-flex items-center justify-center gap-2">
            Verify on the public ledger
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
