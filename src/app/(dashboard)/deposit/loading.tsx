import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { SkeletonForm } from "@/components/ui/Primitives";

export default function DepositLoading() {
  return (
    <PageShellSkeleton title="Add money">
      {/* Currency, then amount. */}
      <SkeletonForm fields={2} />
    </PageShellSkeleton>
  );
}
