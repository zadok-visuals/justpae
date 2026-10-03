import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { Skeleton } from "@/components/ui/Primitives";

export default function ConvertLoading() {
  return (
    <PageShellSkeleton title="Convert">
      <div className="space-y-4">
        {/* From panel, swap button, To panel — the shape the form resolves to. */}
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="flex justify-center">
          <Skeleton className="size-11 rounded-full" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        {/* Rate line and countdown. */}
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </PageShellSkeleton>
  );
}
