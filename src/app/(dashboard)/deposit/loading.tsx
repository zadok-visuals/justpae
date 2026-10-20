import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { SkeletonForm } from "@/components/ui/Primitives";

export default function DepositLoading() {
  return (
    <PageShellSkeleton title="Deposit">
      {/* Currency, then amount. */}
      <SkeletonForm fields={2} />
    </PageShellSkeleton>
  );
}
