import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { SkeletonCard } from "@/components/ui/Primitives";

export default function ProfileLoading() {
  return (
    <PageShellSkeleton title="Profile" subtitle={false}>
      <div className="space-y-4">
        <SkeletonCard className="h-40" />
        <SkeletonCard className="h-32" />
        <SkeletonCard className="h-32" />
        <SkeletonCard className="h-20" />
      </div>
    </PageShellSkeleton>
  );
}
