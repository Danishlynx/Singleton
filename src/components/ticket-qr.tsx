"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";

/**
 * The "this is a ticket" block: a QR encoding the receipt's own URL, so a door
 * scanner (or a curious judge's phone) lands on the live receipt with its
 * derived rank — which itself links to the public verify ledger. Client-only
 * because it needs window.location.origin for an absolute, scannable URL.
 */
export function TicketQr({ allocationId }: { allocationId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}/receipt/${allocationId}`);
  }, [allocationId]);

  if (!url) return null;

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
      <div className="rounded-md bg-white p-2" data-testid="ticket-qr">
        <QRCode value={url} size={96} aria-label="QR code linking to this receipt" />
      </div>
      <div className="text-sm">
        <p className="font-medium">Scan at the door</p>
        <p className="mt-1 text-muted-foreground">
          Links straight to this receipt and its place on the public ledger — verifiable on any
          phone, no app needed.
        </p>
      </div>
    </div>
  );
}
