"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";

/**
 * The "this is a ticket" block: a QR encoding the receipt's own URL, so a door
 * scanner (or a curious judge's phone) lands on the live receipt with its
 * derived rank — which itself links to the public verify ledger. Client-only
 * because it needs window.location.origin for an absolute, scannable URL.
 *
 * Counterfoil pass: styled as the torn-off stub of the receipt above it — same
 * paper, a dashed perforation between the (functional) QR and the label.
 */
export function TicketQr({ allocationId }: { allocationId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}/receipt/${allocationId}`);
  }, [allocationId]);

  if (!url) return null;

  return (
    <div className="mx-auto flex w-full max-w-md items-stretch gap-5 rounded-xl border bg-card p-5">
      <div className="shrink-0 self-center rounded-md border bg-white p-2" data-testid="ticket-qr">
        <QRCode value={url} size={96} aria-label="QR code linking to this receipt" />
      </div>
      <div className="flex flex-col justify-center border-l-2 border-dashed pl-5 text-sm">
        <p className="micro-label text-muted-foreground">Stub</p>
        <p className="mt-1.5 font-medium">Scan at the door</p>
        <p className="mt-1 text-muted-foreground">
          Links straight to this receipt and its place on the public ledger — verifiable on any
          phone, no app needed.
        </p>
      </div>
    </div>
  );
}
