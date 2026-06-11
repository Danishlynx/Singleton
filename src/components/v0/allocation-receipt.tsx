// Scaffolded with v0 (v0 Max): https://v0.app/chat/fair-allocation-receipt-r02sWMCWGhN
// Imported from the v0 export (components/allocation-receipt.tsx).
// Adaptations from the original: the verify anchor uses next/link for client-side nav.
import Link from "next/link";
import { CheckCircle, ShieldCheck, ExternalLink } from "lucide-react";

import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="font-normal">
            Singleton
          </Badge>
          <span className="text-xs text-muted-foreground">Allocation receipt</span>
        </div>

        <div className="flex items-start gap-3">
          <CheckCircle className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold leading-tight text-balance">
              You secured a slot
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{releaseTitle}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Separator />

        {/* Hero: position */}
        <section aria-labelledby="position-label" className="space-y-2">
          <h3 id="position-label" className="text-sm font-medium text-muted-foreground">
            Your position
          </h3>
          <div className="flex items-baseline gap-3">
            <span className="text-6xl font-bold tracking-tight tabular-nums text-foreground">
              #{rank}
            </span>
            <span className="text-lg text-muted-foreground tabular-nums">of {capacity}</span>
          </div>
        </section>

        <Separator />

        {/* Details */}
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Secured at</dt>
            <dd className="tabular-nums text-foreground text-right">{utcLabel} UTC</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Receipt id</dt>
            <dd className="font-mono text-foreground" title={allocationId}>
              {truncateId(allocationId)}
            </dd>
          </div>
        </dl>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-4">
        <Separator />
        <p className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
          <ShieldCheck className="size-4 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
          <span>
            Your position is derived from an immutable public ledger — anyone can re-check it
            independently.
          </span>
        </p>
        <Button asChild variant="outline" className="w-full bg-transparent">
          <Link href={verifyHref} className="inline-flex items-center justify-center gap-2">
            Verify on the public ledger
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
