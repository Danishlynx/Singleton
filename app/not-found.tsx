import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <SearchX className="size-10 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
        <p className="text-sm text-muted-foreground">
          This release, receipt, or page doesn&apos;t exist — it may have been mistyped or never
          created. Everything real is on the ledger.
        </p>
        <Button asChild className="mt-2">
          <Link href="/">Back to releases</Link>
        </Button>
      </main>
      <SiteFooter />
    </>
  );
}
