import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { Skeleton } from "@/components/ui/Primitives";

export default function BillsLoading() {
  return (
    <PageShellSkeleton title="Bills &amp; airtime">
      <div className="space-y-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div>
          <Skeleton className="mb-3 h-3.5 w-44" />
          {/* Same grid as the real category tiles, so nothing reflows. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </PageShellSkeleton>
  );
}
