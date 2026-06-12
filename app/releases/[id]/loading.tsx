import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
        <div className="space-y-4 rounded-xl border p-0">
          <Skeleton className="h-52 w-full rounded-b-none rounded-t-xl" />
          <div className="space-y-4 p-6">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </main>
    </>
  );
}
