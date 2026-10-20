import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/ui/Primitives";
import { RecentActivitySection } from "@/components/transactions/RecentActivitySection";
import { currencyMeta, formatAmount, CURRENCIES } from "@/lib/currencies";
import { startRouteTiming } from "@/lib/perf/timing";
import { isWalletLocked } from "@/lib/services";
import { MaintenanceBadge } from "@/components/ui/MaintenanceBadge";
import type { Currency, Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Accounts" };

/** A balance is the one thing a cached render must never be wrong about. */
export const dynamic = "force-dynamic";

/**
 * /accounts.
 *
 * Home shows the same balances, so this page has to earn its place by being
 * the way IN to one wallet rather than another view of all of them. Each row
 * is a link to that currency's own page, where the actions, the funding
 * instructions and that currency's activity live.
 *
 * Deliberately cheap: no live rate lookups and no per-currency route
 * resolution. Those cost a provider round trip each, and this page exists to
 * be passed through, not read. /accounts/[currency] pays that cost once, for
 * the one wallet the user actually opened.
 */
export default async function AccountsPage() {
  const endRouteTiming = startRouteTiming("/accounts");
  const supabase = await createClient();
  const user = await requireSessionUser();

  // GROUP 9b. ONE await, and it is the one the page cannot draw without.
  //
  // Group 6a added a recent-activity read here for the second column and
  // noted that this is where it should end up: RecentActivitySection owns
  // that query inside its own Suspense boundary now, so the balances — one
  // indexed Postgres read next door to the function — are sent without
  // waiting on a join whose cost grows with the number of rows the account
  // has. The customer with four thousand transactions is the one who opens
  // this page most.
  const { data } = await supabase.from("wallets").select("*").eq("user_id", user.id);
  const wallets = (data ?? []) as Wallet[];
  endRouteTiming();

  // Config order, not database order, so rows don't reshuffle between loads.
  const ordered = [...wallets].sort(
    (a, b) => currencyIndex(a.currency) - currencyIndex(b.currency),
  );

  return (
    <PageShell
      title="Accounts"
      subtitle="One wallet per currency. Open one to add money, convert or withdraw."
      back={{ href: "/home", label: "Home" }}
      /* GROUP 6a — the same two-column pattern as /home and
         /accounts/[currency]: the thing you act on in the left column, the
         reference beside it. Before this, a list of five rows in a 42rem
         column was 300px of content in a 1440px window. */
      aside={
        <RecentActivitySection userId={user.id} limit={6} seeAllHref="/transactions" />
      }
    >
      {ordered.length === 0 ? (
        <EmptyState
          title="No wallets yet"
          body="Every account gets a dollar and a USDT wallet, plus a local one for your country. If yours are missing, our team can sort it out."
          action={{ href: "/support", label: "Contact support" }}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {ordered.map((wallet) => {
            const meta = currencyMeta(wallet.currency);
            const locked = isWalletLocked(wallet.currency);
            const rowClassName =
              "flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3";
            const row = (
              <>
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="text-lg leading-none">
                    {meta.flag}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {wallet.currency}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {meta.label}
                    </span>
                  </span>
                  {/* GROUP 2b */}
                  {locked && <MaintenanceBadge className="shrink-0" />}
                </span>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatAmount(wallet.currency, wallet.balance)}
                </span>
              </>
            );
            return (
              <li key={wallet.currency}>
                {locked ? (
                  <div className={`${rowClassName} opacity-80`}>{row}</div>
                ) : (
                  <Link href={`/accounts/${wallet.currency}`} className={rowClassName}>
                    {row}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}

const ORDER: Currency[] = CURRENCIES.map((c) => c.code);
function currencyIndex(currency: Currency): number {
  const index = ORDER.indexOf(currency);
  return index === -1 ? ORDER.length : index;
}
