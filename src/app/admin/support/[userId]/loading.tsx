import { Skeleton } from "@/components/ui/Primitives";

/**
 * A thread-shaped boundary, overriding /admin's queue-shaped one.
 *
 * /admin/loading.tsx already covers this route — a nested segment inherits
 * the closest ancestor — so this is not fixing a missing boundary. It is
 * fixing a misleading one: the inherited skeleton is a column of equal
 * queue rows, and this page is a conversation. Opening a thread and seeing
 * four identical grey rectangles reads as "the list is loading", so an
 * operator clicking through a busy inbox cannot tell whether their click
 * registered on the right row until the real content lands.
 *
 * Alternating alignment and uneven widths, because that is what a thread
 * looks like, and the point of a skeleton is to be recognisable as the thing
 * it stands in for.
 */
export default function AdminSupportThreadLoading() {
  const bubbles = [
    { fromUser: true, width: "w-3/5" },
    { fromUser: false, width: "w-2/5" },
    { fromUser: true, width: "w-1/2" },
    { fromUser: false, width: "w-3/5" },
    { fromUser: true, width: "w-1/3" },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>

      <div className="space-y-3">
        {bubbles.map((bubble, i) => (
          <div key={i} className={`flex ${bubble.fromUser ? "justify-start" : "justify-end"}`}>
            <Skeleton className={`h-16 rounded-2xl ${bubble.width} max-w-[70%]`} />
          </div>
        ))}
      </div>

      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
