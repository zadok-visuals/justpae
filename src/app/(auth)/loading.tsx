import { Skeleton, SkeletonForm } from "@/components/ui/Primitives";

/**
 * One loading state for the whole auth group — sign in, sign up, forgot and
 * reset password all resolve to the same shape inside the same shell, so four
 * near-identical files would be four places to keep in step for no gain.
 *
 * It sits inside (auth)/layout.tsx, so the wordmark and the centred card are
 * already on screen; this is only the card's contents. Before it existed,
 * every auth navigation showed the previous screen frozen until the server
 * answered.
 */
export default function AuthLoading() {
  return (
    <div className="space-y-5">
      {/* Heading and the line under it. */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-40 rounded-md" />
        <Skeleton className="h-4 w-full max-w-[16rem] rounded" />
      </div>

      <SkeletonForm fields={2} />

      {/* The "no account yet?" / "back to sign in" link below the button. */}
      <Skeleton className="mx-auto h-4 w-48 rounded" />
    </div>
  );
}
