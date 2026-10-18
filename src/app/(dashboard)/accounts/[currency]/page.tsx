import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { AccountActions } from "@/components/accounts/AccountActions";
import { BuySellRates } from "@/components/rates/BuySellRates";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { SectionHeader, Card, Banner, EmptyState } from "@/components/ui/Primitives";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { accountActions, howToAddMoney } from "@/lib/accounts/actions";
import { fetchActivityPage } from "@/lib/transactions";
import { listRoutesFrom } from "@/lib/actions/convert";
import { resolveRateBoard, localRateCurrencies } from "@/lib/rates/display";
import { currencyMeta, formatAmount, isCurrency, USD_CONVERSION_UNAVAILABLE } from "@/lib/currencies";
import { startRouteTiming } from "@/lib/perf/timing";
import type { Currency, Wallet } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 5;

export async function generateMetadata(props: PageProps<"/accounts/[currency]">) {
  const { currency } = await props.params;
  if (!isCurrency(currency)) return { title: "Account" };
  return { title: `${currency} account` };
}

/**
 * /accounts/[currency] — one wallet, everything about it.
 *
 * The question this page answers that no other screen did: "I am holding
 * cedis. What can I actually do with them?" /deposit, /convert and /withdraw
 * each know the answer for their own verb, and each only reveals it after the
 * user has picked a currency inside that flow. A cedi holder had to open
 * three screens to discover that two of them would turn them away.
 *
 * So every action is listed here, enabled or not, with one line of reason —
 * and the rules come from the modules that own them (see
 * src/lib/accounts/actions.ts), never restated.
 *
 * 404s for anything outside the currency config rather than rendering an
 * empty shell for /accounts/BTC.
 */
export default async function AccountPage(props: PageProps<"/accounts/[currency]">) {
  const { currency: raw } = await props.params;
  if (!isCurrency(raw)) notFound();
  const currency: Currency = raw;

  const endRouteTiming = startRouteTiming(`/accounts/${currency}`);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const meta = currencyMeta(currency);

  const [{ data: walletRow }, routes, activity, rates] = await Promise.all([
    supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user.id)
      .eq("currency", currency)
      .maybeSingle(),
    // Live, because "can I convert cedis" has a different answer today than
    // it had last month and the page must not guess. USD short-circuits
    // inside resolveRoute with no provider call at all.
    listRoutesFrom(currency),
    // THIS CURRENCY ONLY. The transactions reader already supports the
    // filter; using it is what keeps this list and /transactions?currency=X
    // agreeing about what belongs to a wallet.
    fetchActivityPage(supabase, user.id, { currency }, 0, RECENT_LIMIT),
    loadRatesFor(currency),
  ]);

  endRouteTiming();

  const wallet = walletRow as Wallet | null;

  // A route table where nothing is routable means the currency cannot be
  // converted at all right now — GHS today — and the page should say that
  // rather than offering a Convert tile that dead-ends.
  const anyRoute = routes.some((r) => r.available);
  const actions = accountActions(
    currency,
    anyRoute
      ? { available: true, reason: null }
      : {
          available: false,
          reason:
            routes.find((r) => !r.available)?.reason ??
            `${currency} can't be converted right now.`,
        },
  );

  return (
    <PageShell
      title={`${currency} account`}
      subtitle={meta.label}
      back={{ href: "/accounts", label: "Accounts" }}
      wide
    >
      {/* One column on a phone, two from `lg` up. The balance, the actions and
          the funding instructions are the column a user reads top to bottom;
          rates and activity are the reference column beside it. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <section>
            <SectionHeader title="Balance" />
            <Card>
              {wallet ? (
                <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
                  {formatAmount(currency, wallet.balance)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You don&apos;t have a {meta.label} wallet. Every account gets a dollar and a
                  USDT wallet plus a local one for its country — our team can open another if
                  you need it.
                </p>
              )}
            </Card>
          </section>

          {/* USD is a standing state, not a passing one, so it says so once at
              the top rather than only inside the disabled Convert tile. */}
          {currency === "USD" && (
            <Banner tone="info" title="Dollar conversions aren't open yet">
              {USD_CONVERSION_UNAVAILABLE}
            </Banner>
          )}

          <section>
            <SectionHeader title="What you can do" />
            <AccountActions actions={actions} />
          </section>

          <section>
            <SectionHeader title="Adding money" />
            <Card>
              <p className="text-sm text-muted-foreground">{howToAddMoney(currency)}</p>
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          {rates.length > 0 && (
            <section>
              <SectionHeader title="Today's rates" />
              <BuySellRates rates={rates} />
              <div className="mt-1.5">
                <LiveRefresh showTimestamp label="Rates updated" />
              </div>
            </section>
          )}

          <section>
            <SectionHeader
              title="Recent activity"
              action={{ href: `/transactions?currency=${currency}`, label: "See all" }}
            />
            {activity.rows.length === 0 ? (
              <EmptyState
                title={`No ${currency} activity yet`}
                body={`Money moving in or out of your ${currency} wallet shows up here.`}
              />
            ) : (
              <ActivityRows rows={activity.rows} grouped={false} />
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}

/**
 * Which rates belong on this wallet's page.
 *
 * A local-currency wallet gets its own pair and nothing else — a naira holder
 * does not need the shilling board on their naira page. The USDT wallet gets
 * the whole board, because every row on it is a price for the thing that
 * wallet holds. USD gets none: it has no pair on this account, and the banner
 * above already explains that in words rather than as two empty cells.
 */
async function loadRatesFor(currency: Currency) {
  if (currency === "USD") return [];
  if (currency === "USDT") return resolveRateBoard();
  if (!localRateCurrencies().includes(currency)) return [];
  return resolveRateBoard([currency]);
}
