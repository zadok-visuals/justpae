import { Skeleton } from "@/components/ui/Primitives";

/**
 * One boundary for the whole /admin segment. Every admin page is a heading
 * followed by a stack of cards or queue rows, so a single shape stands in for
 * all of them — and nested segments inherit this boundary rather than each
 * needing a near-identical copy.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-56" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
