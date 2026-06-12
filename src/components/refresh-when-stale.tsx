"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetch the server-rendered page when it is shown again with old data.
 *
 * Next's client router serves cached payloads on back/forward navigation and
 * the browser's bfcache restores whole pages, so a visitor returning to the
 * landing could see a list snapshot from minutes ago (stale counts, swept test
 * releases) until a hard refresh. This component compares the server render
 * time against the clock whenever the page mounts, is restored from bfcache,
 * or the tab becomes visible again, and calls router.refresh() if the data is
 * older than STALE_MS. A fresh first paint stays a single fetch.
 */
const STALE_MS = 5_000;

export function RefreshWhenStale({ renderedAt }: { renderedAt: number }) {
  const router = useRouter();

  useEffect(() => {
    const refreshIfStale = () => {
      if (Date.now() - renderedAt > STALE_MS) router.refresh();
    };
    refreshIfStale(); // covers client-side back/forward from the router cache
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refreshIfStale(); // bfcache restore
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [renderedAt, router]);

  return null;
}
