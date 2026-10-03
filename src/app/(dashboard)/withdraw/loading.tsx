import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { SkeletonForm } from "@/components/ui/Primitives";

export default function WithdrawLoading() {
  return (
    <PageShellSkeleton title="Withdraw">
      {/* Currency, recipient, then amount. */}
      <SkeletonForm fields={3} />
    </PageShellSkeleton>
  );
}
