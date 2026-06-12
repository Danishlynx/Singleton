import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllocationWithRank } from "@/db/allocations";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { AllocationReceipt } from "@/components/v0/allocation-receipt";
import { TicketQr } from "@/components/ticket-qr";
import { Button } from "@/components/ui/button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ allocationId: string }>;
}) {
  const { allocationId } = await params;
  const receipt = await getAllocationWithRank(allocationId);
  if (!receipt) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-12">
        {/* Receipt card scaffolded with v0 — see src/components/v0/allocation-receipt.tsx */}
        <AllocationReceipt
          releaseTitle={receipt.releaseTitle}
          rank={receipt.rank}
          capacity={receipt.capacity}
          claimedAt={receipt.claimedAt}
          allocationId={receipt.allocationId}
          verifyHref={`/verify/${receipt.releaseId}`}
        />
        <TicketQr allocationId={receipt.allocationId} />
        {receipt.lotteryEntryId && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">You entered the window — selected</p>
            <p className="mt-1 text-muted-foreground">
              Your entry{" "}
              <span className="font-mono text-xs" data-testid="receipt-entry-id">
                {receipt.lotteryEntryId}
              </span>{" "}
              was drawn under the published fairness commitment.{" "}
              <Link
                className="underline underline-offset-4"
                href={`/verify/${receipt.releaseId}`}
              >
                Re-run the draw yourself
              </Link>
              .
            </p>
          </div>
        )}
        <Button asChild variant="ghost" className="w-full">
          <Link href={`/releases/${receipt.releaseId}`}>Back to release</Link>
        </Button>
      </main>
      <SiteFooter />
    </>
  );
}
