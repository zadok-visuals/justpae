import { Wordmark } from "@/components/layout/Mark";
import { Skeleton } from "@/components/ui/Primitives";

/**
 * Covers /auth/verify, /auth/confirm and /auth/callback. These routes have no
 * shared layout of their own — each builds its own shell — so this repeats the
 * shell rather than inheriting one.
 *
 * Worth having specifically because /auth/confirm and /auth/callback are the
 * routes a user lands on from an email link, after a tap in a mail client,
 * which is the moment they are least sure anything is happening at all.
 */
export default function AuthRouteLoading() {
  return (
    <div className="flex min-h-screen-dvh flex-col bg-background">
      <header className="flex items-center px-5 pb-2 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
        <Wordmark />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 rounded-md" />
            <Skeleton className="h-4 w-full max-w-[18rem] rounded" />
          </div>

          {/* The code field is a single wide input, not a stack of fields. */}
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="mx-auto h-4 w-40 rounded" />
        </div>
      </main>
    </div>
  );
}
