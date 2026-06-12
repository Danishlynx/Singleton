import Link from "next/link";
import { notFound } from "next/navigation";
import { getRelease } from "@/db/releases";
import { getLedger } from "@/db/allocations";
import { getMode } from "@/db/lottery";
import { LotteryProof } from "@/components/lottery-proof";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, ShieldAlert } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const release = await getRelease(releaseId);
  if (!release) notFound();
  const ledger = await getLedger(releaseId);
  const withinCapacity = ledger.length <= release.capacity;
  const isLottery = (await getMode(releaseId)) === "lottery";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-12">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Public ledger</h1>
          <p className="text-sm text-muted-foreground">{release.title}</p>
        </div>

        {/* Mode B: commit-reveal draw proof + client-side re-run, alongside the ledger. */}
        {isLottery && <LotteryProof releaseId={releaseId} />}

        <div
          className={`flex items-center gap-3 rounded-lg border p-4 ${
            withinCapacity ? "bg-muted/40" : "border-destructive/40 bg-destructive/5"
          }`}
        >
          {withinCapacity ? (
            <CheckCircle2 className="size-5 text-primary" />
          ) : (
            <ShieldAlert className="size-5 text-destructive" />
          )}
          <div className="text-sm">
            <div className="font-medium">
              {ledger.length} of {release.capacity} slots allocated
            </div>
            <div className="text-muted-foreground">
              {withinCapacity
                ? "Within capacity, no oversell. Ranks are contiguous and first-come."
                : "Capacity exceeded. This should never happen."}
            </div>
          </div>
          <Badge
            variant={withinCapacity ? "default" : "destructive"}
            className="ml-auto rounded-full"
          >
            {withinCapacity ? "Verified" : "Invalid"}
          </Badge>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Secured at (UTC)</TableHead>
                <TableHead className="text-right">Receipt id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No allocations yet.
                  </TableCell>
                </TableRow>
              ) : (
                ledger.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="tabular-nums font-medium">#{row.rank}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.claimedAt.replace("T", " ").replace("Z", "")}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {row.id.slice(0, 8)}…
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          The ledger is ordered by (claimed_at, id). Each rank is derived, not stored.{" "}
          <Link className="underline underline-offset-4" href={`/releases/${releaseId}`}>
            Return to the release
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
