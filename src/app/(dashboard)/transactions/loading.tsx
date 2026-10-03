import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { Skeleton, SkeletonRows } from "@/components/ui/Primitives";

export default function TransactionsLoading() {
  return (
    <PageShellSkeleton title="Activity" wide subtitle={false}>
      <div className="space-y-5">
        {/* The filter chip row, then the search field. */}
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-12 w-full" />

        {/* A date heading, then its rows — the grouping the real list uses. */}
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <SkeletonRows rows={6} />
        </div>
      </div>
    </PageShellSkeleton>
  );
}
