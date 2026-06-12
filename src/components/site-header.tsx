import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary font-mono text-xs text-primary-foreground">
            S
          </span>
          Singleton
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/#releases" className="transition-colors hover:text-foreground">
            Releases
          </Link>
          <Link href="/admin" className="transition-colors hover:text-foreground">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-dashed">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 font-mono text-[11px] leading-relaxed text-muted-foreground">
        <span>Singleton: provably-fair, no-oversell allocation on Amazon Aurora DSQL.</span>
        <span className="text-muted-foreground/70">
          Strongly consistent · serverless · multi-region. No blockchain.
        </span>
      </div>
    </footer>
  );
}
