import { Skeleton, SkeletonForm } from "@/components/ui/Primitives";

/**
 * Covers every route under /onboarding — the stage-one page, both ID wizards
 * and the status page — because a loading boundary serves its whole segment.
 * Onboarding sits outside the dashboard chrome, so this is a bare shell rather
 * than a PageShellSkeleton.
 */
export default function OnboardingLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      <SkeletonForm fields={3} />
    </div>
  );
}
