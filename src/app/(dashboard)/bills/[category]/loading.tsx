import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { SkeletonForm } from "@/components/ui/Primitives";

export default function BillCategoryLoading() {
  return (
    <PageShellSkeleton title="Pay a bill">
      {/* Biller, customer identifier, amount, source wallet. */}
      <SkeletonForm fields={4} />
    </PageShellSkeleton>
  );
}
