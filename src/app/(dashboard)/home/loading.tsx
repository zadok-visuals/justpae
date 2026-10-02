import { Skeleton, SkeletonRows } from "@/components/ui/Primitives";
import { MobileTopBar } from "@/components/layout/DashboardChrome";

/**
 * Shaped like the page it stands in for — wallet cards, an action row, a rate
 * strip, activity rows. A generic spinner tells the reader nothing about what
 * is coming and lets the layout jump when it arrives.
 */
export default function HomeLoading() {
  return (
    <>
      <MobileTopBar title="Home" />
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
        <Skeleton className="h-20 w-full" />

        <div>
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="flex gap-3 overflow-hidden">
            <Skeleton className="h-28 w-60 shrink-0 sm:w-full" />
            <Skeleton className="h-28 w-60 shrink-0 sm:w-full" />
          </div>
        </div>

        <div>
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-[4.5rem] shrink-0 sm:w-full" />
            ))}
          </div>
        </div>

        <div>
          <Skeleton className="mb-3 h-4 w-28" />
          <SkeletonRows rows={4} />
        </div>
      </div>
    </>
  );
}
