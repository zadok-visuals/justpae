import { notFound, redirect } from "next/navigation";
import { isWalletLocked } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { AccountActions } from "@/components/accounts/AccountActions";
import { RateBoardSection } from "@/components/rates/RateBoardSection";
import { RecentActivitySection } from "@/components/transactions/RecentActivitySection";
import { SectionHeader, Card, Banner } from "@/components/ui/Primitives";
import { MaintenanceBadge } from "@/components/ui/MaintenanceBadge";
import { accountActions, howToAddMoney, howToAddMoneyHeading } from "@/lib/accounts/actions";
import { depositAvailability } from "@/lib/deposits/availability";
import { listRoutesFrom } from "@/lib/actions/convert";
import { localRateCurrencies } from "@/lib/rates/display";
import { currencyMeta, formatAmount, isCurrency, USD_CONVERSION_UNAVAILABLE } from "@/lib/currencies";
import { startRouteTiming } from "@/lib/perf/timing";
import type { Currency, Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

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

  // GROUP 2c. The wallet still exists and still holds a balance — "gone to
  // the list one level up" is the honest answer, not /home.
  if (isWalletLocked(currency)) redirect("/accounts");

  const endRouteTiming = startRouteTiming(`/accounts/${currency}`);
  const supabase = await createClient();
  const user = await requireSessionUser();

  const meta = currencyMeta(currency);

  /**
   * GROUP 9b — TWO awaits, and the judgement call behind keeping the second.
   *
   * The activity list and the rate board are gone from here: they own their
   * own reads inside Suspense boundaries in the aside below, so neither can
   * decide when the balance appears.
   *
   * listRoutesFrom STAYS awaited, which is a deliberate exception to "stream
   * the slow things". The brief asks for the shell, the balances AND THE
   * ACTIONS to render immediately, and the route table is not decoration on
   * the action row — it is what the row IS. Streaming it would mean the
   * primary column's only controls arriving a beat after the page, as a row
   * of skeleton circles, which is worse than the wait: a user who taps where
   * a button is about to be gets nothing, and the whole point of the page is
   * "what can I do with this money".
   *
   * It is also no longer expensive in the common case. Group 9a put the pair
   * prices and markups behind a 30-second shared cache, and listRoutesFrom
   * reads it — so the first visitor in any half-minute window pays for the
   * provider lookups and everybody else gets a memory read. The call is
   * genuinely "live" about availability in the sense that matters: it is
   * re-resolved every thirty seconds rather than baked into a build.
   */
  const [{ data: walletRow }, routes] = await Promise.all([
    supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user.id)
      .eq("currency", currency)
      .maybeSingle(),
    listRoutesFrom(currency),
  ]);

  endRouteTiming();

  const wallet = walletRow as Wallet | null;

  // A route table where nothing is routable means the currency cannot be
  // converted at all right now — GHS today — and the page should say that
  // rather than offering a Convert tile that dead-ends.
  const anyRoute = routes.some((r) => r.available);
  // GROUP 4f: the blocking route's own one-word kind travels with its
  // sentence, so the Convert circle below can be badged "Maintenance" for a
  // pair that is down and "Unsupported" for one that never existed.
  const firstBlocked = routes.find((r) => !r.available);
  const actions = accountActions(
    currency,
    anyRoute
      ? { available: true, reason: null, kind: null }
      : {
          available: false,
          reason: firstBlocked?.reason ?? `${currency} can't be converted right now.`,
          kind: firstBlocked?.unavailableKind ?? "maintenance",
        },
  );

  // GROUP 4f — the state of THIS wallet, said once at the top.
  //
  // /accounts/GHS was the page a cedi holder landed on to find out what was
  // going on, and it said nothing: the rate cells read "Unavailable", the
  // muted circles carried no label, and the only real explanation was behind a
  // tap. A banner is what the USD page already does for its standing state,
  // and the maintenance case has at least as much claim to it — it is the one
  // that ends.
  const deposit = depositAvailability(currency);
  const maintenanceReason =
    !deposit.available && deposit.kind === "maintenance" ? deposit.reason : null;

  const boardCurrencies = rateBoardCurrencies(currency);

  return (
    <PageShell
      title={`${currency} account`}
      subtitle={meta.label}
      back={{ href: "/accounts", label: "Accounts" }}
      /* GROUP 6a. This page invented the two-column pattern by hand, inside a
         max-w-4xl shell, with `lg:grid-cols-2` — two equal halves, which gave
         the reference column as much width as the primary one and capped the
         whole thing 200px narrower than it needed. It now uses PageShell's
         own split: 1fr + 22rem at 1200px, with the aside sticky, and the
         mobile stacking order owned by the shell rather than by this file.
         Home and /accounts use the identical slot, which is what makes it a
         pattern rather than three similar grids. */
      aside={
        <>
          {/* GROUP 9b. Which currencies belong on this board is decided
              synchronously (rateBoardCurrencies below, no I/O), so the
              section either renders with its heading and a skeleton or is
              absent — rather than the page awaiting a provider call to find
              out there was nothing to show. */}
          {boardCurrencies !== null && <RateBoardSection currencies={boardCurrencies} />}

          <RecentActivitySection
            userId={user.id}
            currency={currency}
            limit={RECENT_LIMIT}
            seeAllHref={`/transactions?currency=${currency}`}
          />
        </>
      }
    >
      <div>
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

          {maintenanceReason && (
            <Banner tone="info" title={`Adding ${meta.label} is under maintenance`}>
              <span className="flex flex-wrap items-center gap-2">
                <MaintenanceBadge />
                <span>{maintenanceReason}</span>
              </span>
            </Banner>
          )}

          <section>
            <SectionHeader title="What you can do" />
            <AccountActions actions={actions} />
          </section>

          <section>
            {/* howToAddMoneyHeading, not the literal "Adding money" this
                carried. Group 4d wrote the function — "Getting yuan" for CNY,
                "Receiving dollars" for USD — and then never wired it up, so
                /accounts/CNY still printed "Adding money" over a paragraph
                explaining that yuan is not added. */}
            <SectionHeader title={howToAddMoneyHeading(currency)} />
            <Card>
              <p className="text-sm text-muted-foreground">{howToAddMoney(currency)}</p>
            </Card>
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
 *
 * GROUP 9b MADE THIS SYNCHRONOUS, and that is the point of the rewrite. It
 * used to be `async` and to resolve the board itself, which meant the page
 * had to await a provider call before it could know whether there was a
 * section to render at all — including for USD and CNY, where the answer is
 * "no" and is a standing fact about the currency.
 *
 *   null       no board on this page
 *   undefined  the whole local board (the USDT wallet)
 *   [c]        just this currency's pair
 *
 * `undefined` rather than a spelled-out list so the "whole board" case stays
 * owned by localRateCurrencies() — the one place the list lives.
 */
function rateBoardCurrencies(currency: Currency): Currency[] | undefined | null {
  if (currency === "USD") return null;
  if (currency === "USDT") return undefined;
  if (!localRateCurrencies().includes(currency)) return null;
  return [currency];
}
