import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { ConvertForm } from "@/components/convert/ConvertForm";
import { EmptyState } from "@/components/ui/Primitives";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { listRoutesFrom } from "@/lib/actions/convert";
import { RateBoardSection } from "@/components/rates/RateBoardSection";
import { parseCurrencyParam, preselectCurrency } from "@/lib/accounts/preselect";
import { startRouteTiming } from "@/lib/perf/timing";
import type { Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Convert" };
export const dynamic = "force-dynamic";

export default async function ConvertPage(props: PageProps<"/convert">) {
  const endRouteTiming = startRouteTiming("/convert");
  const supabase = await createClient();
  const user = await requireSessionUser();

  const params = await props.searchParams;

  // has_transaction_pin() rather than selecting from withdrawal_pins: the
  // select policy that allowed that also allowed selecting pin_hash, so it was
  // dropped in 0012. This asks the only question the page actually has.
  const [{ data: wallets }, { data: hasPin }] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id),
    supabase.rpc("has_transaction_pin"),
  ]);

  const list = (wallets ?? []) as Wallet[];

  if (list.length < 2) {
    endRouteTiming();
    return (
      <PageShell title="Convert">
        <EmptyState
          title="You need two wallets to convert"
          body="Every account gets a dollar and a USDT wallet, plus a local one for your country. If something looks missing, contact support."
          action={{ href: "/home", label: "Back to home" }}
        />
      </PageShell>
    );
  }

  // The source wallet the form opens on: `?currency=` when an account page or
  // Home sent the user here with one in mind, the first wallet otherwise.
  //
  // Every wallet is "usable" as a SOURCE — whether a given pair is routable
  // is a question about the destination, and the form disables those
  // individually with their own reasons. Preselecting a currency with no live
  // route is therefore still right: the user asked about that wallet, and the
  // form's banner then tells them about that wallet.
  // When the caller named a DESTINATION but no source — "Convert to CNY"
  // from the yuan account page — the source must not default to the
  // destination itself, which would open the form on CNY → CNY and show
  // "Pick two different wallets" to somebody who picked nothing.
  const requestedTo = parseCurrencyParam(params.to);
  const sourceCandidates = list
    .map((w) => w.currency)
    .filter((currency) => currency !== requestedTo);

  const from = preselectCurrency(
    parseCurrencyParam(params.currency),
    sourceCandidates,
    // The unfiltered list stays the final fallback: a user whose ONLY wallet
    // is the requested destination still has to land on something.
    list.map((w) => w.currency),
  )!;

  // Route availability is resolved for the SOURCE wallet on the server so the
  // form opens with a usable pair already selected. Changing the source
  // refreshes the page, which re-resolves for the new source — the
  // alternative is resolving every source's routes up front, which is one
  // live provider lookup per pair on every page view.
  //
  // GROUP 9b. The rate BOARD is no longer awaited here. It used to sit in
  // this Promise.all, so the form's own fields waited on six provider round
  // trips for a reference table beside them — and resolveRateBoard is the
  // slowest thing this page does by an order of magnitude.
  //
  // The route table stays, because it is not reference material: it decides
  // which destinations the select can offer and which pair the form opens on,
  // and a form whose pickers arrive a beat after the page is a form a user
  // can type the wrong thing into. Group 9a also put it behind the 30-second
  // display cache, so it is a memory read for all but the first visitor in
  // any half-minute.
  const routes = await listRoutesFrom(from);

  endRouteTiming();

  return (
    <PageShell
      title="Convert"
      subtitle="Move money between your wallets at live rates."
      back={{ href: "/home", label: "Home" }}
      /* GROUP 6a — room for MoneyFormLayout's summary column. */
      width="split"
    >
      <ConvertForm
        wallets={list}
        routes={routes}
        hasPin={hasPin === true}
        /* Both sides of every local pair, from the same resolver Home's strip
           and the account pages use — so "Buy USDT at" means the same number
           on all three, and the one shown here is the one this form will
           quote. Handed over as a streamed Server Component rather than as
           resolved prices: see the rateBoard prop's own note. */
        rateBoard={<RateBoardSection />}
        initialFrom={from}
        // Group 4d: "Convert to CNY" on the yuan account page arrives here as
        // ?to=CNY, and must open with yuan already on the destination side.
        initialTo={parseCurrencyParam(params.to)}
      />
      {/* Re-resolves route availability while the screen is open, so a pair
          that came back (or went away) is not still being advertised as it was
          on first load. Longer than Home's interval and with no timestamp: the
          number that actually binds is the server-issued quote, which carries
          its own countdown. router.refresh() keeps client state, so a
          half-typed amount survives. */}
      <LiveRefresh intervalMs={120_000} />
    </PageShell>
  );
}
