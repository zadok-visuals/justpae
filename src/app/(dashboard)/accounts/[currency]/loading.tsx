import { Skeleton, SkeletonRows } from "@/components/ui/Primitives";
import { MobileTopBar } from "@/components/layout/DashboardChrome";

/**
 * Shaped like the two-column page it stands in for. The currency is not known
 * here — a loading file receives no params — so the top bar carries the
 * generic title rather than guessing at one.
 */
export default function AccountLoading() {
  return (
    <>
      <MobileTopBar title="Account" />
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
        <Skeleton className="mb-4 h-4 w-32" />

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="space-y-6">
            <div>
              <Skeleton className="mb-3 h-4 w-20" />
              <Skeleton className="h-20 w-full" />
            </div>
            <div>
              <Skeleton className="mb-3 h-4 w-32" />
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </div>
            <div>
              <Skeleton className="mb-3 h-4 w-28" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <Skeleton className="mb-3 h-4 w-28" />
              <Skeleton className="h-20 w-full" />
            </div>
            <div>
              <Skeleton className="mb-3 h-4 w-32" />
              <SkeletonRows rows={4} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
