"use client";

import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { RefreshCcw, TriangleAlert } from "lucide-react";

// Calm error boundary: transient cluster hiccups (a dropped connection during a
// server render) should look like a retryable moment, not a stack trace.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl border border-dashed bg-card">
          <TriangleAlert className="size-5 text-muted-foreground" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Something hiccuped</h1>
        <p className="text-sm text-muted-foreground">
          Usually a momentary network blip between the app and the database. Nothing was lost —
          every write here is idempotent, so retrying is always safe.
        </p>
        <div className="mt-2 flex gap-2">
          <Button onClick={reset}>
            <RefreshCcw className="size-4" /> Try again
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
