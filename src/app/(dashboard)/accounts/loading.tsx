import { Skeleton } from "@/components/ui/Primitives";
import { MobileTopBar } from "@/components/layout/DashboardChrome";

/** Shaped like the list it stands in for, so nothing jumps when it arrives. */
export default function AccountsLoading() {
  return (
    <>
      <MobileTopBar title="Accounts" />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5 sm:px-6 sm:py-8">
        <Skeleton className="h-4 w-72" />
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </>
  );
}
