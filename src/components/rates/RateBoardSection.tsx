import { Suspense } from "react";
import { BuySellRates } from "@/components/rates/BuySellRates";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { SectionHeader, Skeleton } from "@/components/ui/Primitives";
import { resolveRateBoard, localRateCurrencies } from "@/lib/rates/display";
import type { Currency } from "@/lib/types/database";

/**
 * GROUP 9b — the rate board, streamed, with its own failure box.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS CHANGES ABOUT THE PAGES THAT USE IT
 *
 * /home used to open with:
 *
 *   await Promise.all([profile, wallets, recentActivity, resolveRateBoard()])
 *
 * and resolveRateBoard is six provider round trips. So the slowest thing on
 * the page decided when the FASTEST thing appeared: a user's balance — read
 * from Postgres in Dublin, beside the function, in single-digit milliseconds
 * — waited on a rate board talking across the internet to a provider that
 * sometimes takes a second. Every render. Nothing else on the screen needed
 * that board to exist.
 *
 * Moving the await inside a Suspense boundary inverts it. The shell, the
 * balances, the quick actions and the KYC banner are sent as soon as they are
 * ready; the board arrives in its own chunk, into a skeleton that is already
 * holding its space.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * "RATES UNAVAILABLE, RETRYING" — AND WHY IT IS A BOX, NOT A PAGE
 *
 * The brief is explicit: a slow or failed rate shows that message in its own
 * box, never a blank page. Two mechanisms, because there are two failures:
 *
 *   SLOW     the Suspense fallback. The page is already on screen.
 *   FAILED   resolveRateBoard catches per pair and returns a reason, so one
 *            dead pair degrades one cell. This component additionally catches
 *            around the WHOLE board, for the failure that is not per-pair —
 *            the markup table being unreachable, say — which would otherwise
 *            propagate to the nearest error boundary and take out the page
 *            the user's balance is on.
 *
 * "Retrying" is a claim, so it has to be true: LiveRefresh is rendered INSIDE
 * the failure box as well as beside a healthy board. It re-runs the server
 * render on an interval and again the moment the tab is focused, so the box
 * genuinely does retry and genuinely does replace itself with a board when
 * the provider comes back. Printing "retrying" next to something static would
 * be the kind of small lie that is worse than the error.
 */

/** The skeleton. Sized to the board it replaces so nothing jumps. */
export type RateBoardVariant = "strip" | "stacked" | "list";

export function RateBoardSkeleton({ variant = "stacked" }: { variant?: RateBoardVariant }) {
  if (variant === "strip") {
    return (
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[4.5rem] min-w-[11.5rem] shrink-0 rounded-lg" />
        ))}
      </div>
    );
  }
  if (variant === "list") {
    return <Skeleton className="h-[8.5rem] w-full rounded-xl" />;
  }
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[5.5rem] w-full rounded-xl" />
      ))}
    </div>
  );
}

function RatesUnavailable() {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p aria-live="polite" className="text-sm font-medium text-foreground">
        Rates unavailable, retrying
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Your balances are correct and nothing else is affected. We&apos;ll show today&apos;s
        prices as soon as our pricing comes back.
      </p>
      {/* The retry the sentence above promises. */}
      <div className="mt-2">
        <LiveRefresh intervalMs={15_000} />
      </div>
    </div>
  );
}

/** The awaited half. Separated so Suspense has an async child to suspend on. */
async function RateBoard({
  currencies,
  variant,
}: {
  currencies?: Currency[];
  variant: RateBoardVariant;
}) {
  let rates;
  try {
    rates = await resolveRateBoard(currencies ?? localRateCurrencies());
  } catch (err) {
    // Never thrown onward. This component sits on the page that shows a
    // balance, and a pricing outage must not be able to blank that.
    console.error("[RateBoardSection] board failed", err);
    return <RatesUnavailable />;
  }

  // An empty board is the same situation as a failed one from the reader's
  // side: no prices, and no explanation unless one is given.
  if (rates.length === 0) return <RatesUnavailable />;

  return (
    <>
      <BuySellRates rates={rates} variant={variant} />
      <div className="mt-1.5">
        <LiveRefresh showTimestamp label="Rates updated" />
      </div>
    </>
  );
}

export function RateBoardSection({
  currencies,
  variant = "stacked",
  title = "Today's rates",
  action,
}: {
  /** Omitted means the whole local-currency board. */
  currencies?: Currency[];
  variant?: RateBoardVariant;
  title?: string;
  action?: { href: string; label: string };
}) {
  return (
    <section>
      <SectionHeader title={title} action={action} />
      {/* The heading is OUTSIDE the boundary on purpose: it is free, it tells
          the reader what the skeleton below is going to become, and it means
          the section does not pop into existence a beat after everything
          else. */}
      <Suspense fallback={<RateBoardSkeleton variant={variant} />}>
        <RateBoard currencies={currencies} variant={variant} />
      </Suspense>
    </section>
  );
}
