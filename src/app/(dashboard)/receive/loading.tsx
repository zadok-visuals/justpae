import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { SkeletonCard } from "@/components/ui/Primitives";

export default function ReceiveLoading() {
  return (
    <PageShellSkeleton title="Receive dollars">
      <div className="space-y-4">
        <SkeletonCard className="h-20" />
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-40" />
      </div>
    </PageShellSkeleton>
  );
}
