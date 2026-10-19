import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { EmptyState, SectionHeader, SkeletonRows } from "@/components/ui/Primitives";
import { fetchActivityPage, fetchRecentActivity } from "@/lib/transactions";
import type { Currency } from "@/lib/types/database";

/**
 * GROUP 9b — recent activity, streamed.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY ACTIVITY AND NOT JUST RATES
 *
 * The rate board is the obviously slow thing, and it was the one the brief
 * named first. But the activity read is the one that gets slower as a user
 * gets more valuable: it is a join across transactions, deposits and the
 * per-currency filter, ordered by date, and its cost grows with the number of
 * rows the account has. A customer with four transactions never notices it; a
 * customer with four thousand is the one whose /home is slow, and they are
 * the customer who opens it most.
 *
 * Neither the balances nor the actions depend on it, so it has no business
 * deciding when they appear.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE QUERY IS MADE HERE, NOT PASSED IN
 *
 * The point of a Suspense boundary is that the await happens INSIDE it. A
 * page that awaits the rows and passes them down has already paid for them
 * before it renders anything, and wrapping the result in <Suspense> then
 * achieves precisely nothing — which is the easy way to write this and look
 * like it works.
 *
 * So this component owns its own Supabase client and its own read. It costs a
 * second `createClient()` per page, which is cookie parsing rather than a
 * round trip, and src/lib/auth/session.ts memoises the getUser() behind it
 * for the request (Group 8).
 *
 * A FAILED READ IS NOT CAUGHT HERE, deliberately, and this is the opposite
 * call from the rate board's. A rate board that cannot price is a degraded
 * page; an activity list that silently renders "nothing here yet" after a
 * failed query would be telling a user their money moved nowhere. That is a
 * lie about their account, and the right outcome is the error boundary.
 */

export function RecentActivitySection({
  userId,
  currency,
  limit = 5,
  title = "Recent activity",
  seeAllHref,
}: {
  userId: string;
  /** Scopes to one wallet, for an account page. Omitted means every wallet. */
  currency?: Currency;
  limit?: number;
  title?: string;
  seeAllHref?: string;
}) {
  return (
    <section>
      <SectionHeader
        title={title}
        action={seeAllHref ? { href: seeAllHref, label: "See all" } : undefined}
      />
      <Suspense fallback={<SkeletonRows rows={Math.min(limit, 4)} />}>
        <RecentActivity userId={userId} currency={currency} limit={limit} />
      </Suspense>
    </section>
  );
}

async function RecentActivity({
  userId,
  currency,
  limit,
}: {
  userId: string;
  currency?: Currency;
  limit: number;
}) {
  const supabase = await createClient();

  // Two readers, because they answer two different questions and the
  // per-currency one is the only one that can filter. Unchanged from what the
  // pages did inline — this is a move, not a rewrite.
  const rows = currency
    ? (await fetchActivityPage(supabase, userId, { currency }, 0, limit)).rows
    : await fetchRecentActivity(supabase, userId, limit);

  if (rows.length === 0) {
    return currency ? (
      <EmptyState
        title={`No ${currency} activity yet`}
        body={`Money moving in or out of your ${currency} wallet shows up here.`}
      />
    ) : (
      <EmptyState
        title="Nothing here yet"
        body="Your deposits, conversions, withdrawals and bill payments will show up here."
        action={{ href: "/convert", label: "Make your first conversion" }}
      />
    );
  }

  return <ActivityRows rows={rows} grouped={false} />;
}
