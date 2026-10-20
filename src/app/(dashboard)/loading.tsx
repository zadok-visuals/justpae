import { PageShellSkeleton } from "@/components/layout/PageShellSkeleton";
import { Skeleton } from "@/components/ui/Primitives";

/**
 * GROUP 11c — the group-level fallback, and the reason nav prefetching works
 * at all.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT WAS ACTUALLY BROKEN
 *
 * The brief asks to "make sure nav links prefetch", and the first thing to
 * check was whether they do. They do — `<Link>` prefetches by default — but
 * what the default prefetches for a route marked `force-dynamic` is its
 * STATIC SHELL: the layouts, plus the nearest `loading.tsx`. There is no full
 * RSC payload to cache for a page whose whole job is to be rendered fresh.
 *
 * Which means a dynamic route with no loading boundary has nothing to
 * prefetch. The prefetch fires, finds a shell consisting of the layout the
 * user is already looking at, and caches that. Tapping the link then shows
 * the current page, frozen, until the full server render arrives — the exact
 * symptom that reads as "the app didn't respond to my tap".
 *
 * Twelve dashboard routes had their own loading.tsx. Two did not:
 * /pay-to-china and /flights — both of them links in the sidebar, so both of
 * them things a user taps from a cold start.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY A GROUP-LEVEL FILE RATHER THAN TWO MORE ROUTE-LEVEL ONES
 *
 * Next resolves the NEAREST loading.tsx, so this changes nothing for the
 * twelve routes that have their own tailored skeleton — those are better than
 * a generic one and they keep winning. What this adds is a floor: a dashboard
 * route cannot be added in future WITHOUT a prefetchable shell, which is how
 * these two came to be missing one in the first place. Two more hand-written
 * files would have fixed today and left the next one to be noticed by a user.
 *
 * `/admin` already has this arrangement — one loading.tsx at the segment root
 * covering all eleven pages under it — so this is the pattern the app already
 * uses, applied to the half of it that was missing it.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THE SKELETON IS DELIBERATELY VAGUE
 *
 * A route-level skeleton can match the shape its page resolves to, and should.
 * A fallback for "any dashboard page" cannot know that shape, and guessing
 * wrong is worse than not guessing: a skeleton showing three cards where a
 * form appears makes the content jump, which is more disruptive than a plain
 * wait. So this is a title and some generic blocks — enough that the shell,
 * the chrome and the page title arrive instantly and the user knows the tap
 * registered.
 */
export default function DashboardLoading() {
  return (
    <PageShellSkeleton>
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </PageShellSkeleton>
  );
}
