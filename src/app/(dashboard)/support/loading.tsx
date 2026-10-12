import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { Skeleton } from "@/components/ui/Primitives";

/**
 * Bubble-shaped skeletons, alternating sides, so the shape of a conversation
 * is already on screen before the conversation is — rather than a generic
 * stack of rows that reflows into something else entirely.
 */
const BUBBLES = [
  { fromUser: false, width: "w-3/5" },
  { fromUser: true, width: "w-2/5" },
  { fromUser: false, width: "w-1/2" },
];

export default function Loading() {
  return (
    <PageShellSkeleton title="Support">
      <div className="flex flex-col gap-3">
        {BUBBLES.map((bubble, i) => (
          <div key={i} className={`flex ${bubble.fromUser ? "justify-end" : "justify-start"}`}>
            <Skeleton className={`h-16 rounded-2xl ${bubble.width}`} />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <Skeleton className="size-11 shrink-0 rounded-full" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="size-11 shrink-0 rounded-full" />
      </div>
    </PageShellSkeleton>
  );
}
