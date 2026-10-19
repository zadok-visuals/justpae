import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { PayToChinaForm } from "@/components/payToChina/PayToChinaForm";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { SectionHeader, SkeletonRows } from "@/components/ui/Primitives";
import { fetchActivityPage } from "@/lib/transactions";
import { parseCurrencyParam } from "@/lib/accounts/preselect";
import { startRouteTiming } from "@/lib/perf/timing";
import type { SavedPayToChinaRecipient, Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Pay to China" };
export const dynamic = "force-dynamic";

/**
 * /pay-to-china.
 *
 * A manual payout with an automated product's manners. The customer picks a
 * wallet, types an amount, sees what their recipient actually receives, and
 * gets told at every step afterwards — because unlike every other movement
 * in this app, a person settles this one by hand and it can sit for hours.
 *
 * Every figure comes from the server. See src/lib/actions/payToChina.ts for
 * why none of them can come from the browser.
 */
export default async function PayToChinaPage(props: PageProps<"/pay-to-china">) {
  const endRouteTiming = startRouteTiming("/pay-to-china");
  const supabase = await createClient();
  const user = await requireSessionUser();

  const params = await props.searchParams;

  /**
   * GROUP 9b. The activity read is gone from here.
   *
   * It was the odd one out in this Promise.all: the other four are single
   * indexed reads keyed on user_id, while the activity page is a join across
   * three tables ordered by date — and this page then threw most of its rows
   * away, filtering a mixed list of five down to the pay-to-china ones. So
   * the form's fields waited on a query whose result was mostly discarded.
   *
   * It streams in its own boundary now, and asks the narrower question while
   * it is there.
   */
  const [{ data: wallets }, { data: saved }, { data: profile }, { data: hasPin }] =
    await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", user.id),
      supabase
        .from("saved_pay_to_china_recipients")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("kyc_status").eq("id", user.id).maybeSingle(),
      // has_transaction_pin() rather than reading withdrawal_pins, whose
      // select policy was dropped in 0012 along with the ability to read
      // pin_hash.
      supabase.rpc("has_transaction_pin"),
    ]);

  endRouteTiming();

  return (
    <PageShell
      title="Pay to China"
      subtitle="Pay a supplier, a landlord or family in China, in yuan."
      back={{ href: "/home", label: "Home" }}
      /* GROUP 6a — room for MoneyFormLayout's summary column. */
      width="split"
    >
      <PayToChinaForm
        wallets={(wallets ?? []) as Wallet[]}
        savedRecipients={(saved ?? []) as SavedPayToChinaRecipient[]}
        hasPin={hasPin === true}
        // Checked here for the UI only. create_pay_to_china_request checks it
        // again in SQL, which is the check that actually holds.
        kycApproved={profile?.kyc_status === "approved"}
        userId={user.id}
        // The wallet the account page sent them here with. The form falls
        // back on its own when that wallet is empty or absent — see its
        // comment on why an unfunded preselection is worse than none.
        initialCurrency={parseCurrencyParam(params.currency) ?? undefined}
      />

      <div className="mt-8">
        <Suspense fallback={<SkeletonRows rows={3} />}>
          <RecentPayments userId={user.id} />
        </Suspense>
      </div>
    </PageShell>
  );
}

/**
 * GROUP 9b — this page's own recent list, streamed.
 *
 * It asks for pay-to-china rows directly rather than taking five rows of
 * everything and filtering. The old version could come back with five
 * deposits and render nothing, which looks identical to having made no
 * payments — so the narrower question is both cheaper and more correct.
 *
 * Renders nothing at all when there are none: this is a secondary list under
 * a form, and an empty state there competes with the thing the page is for.
 */
async function RecentPayments({ userId }: { userId: string }) {
  const supabase = await createClient();
  // `filter: "china"` narrows to the one table that holds these, so the read
  // is a single ranged query rather than three merged ones — see sourcesFor
  // in src/lib/transactions.ts.
  const { rows } = await fetchActivityPage(supabase, userId, { filter: "china" }, 0, 5);

  if (rows.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Recent payments" action={{ href: "/transactions", label: "See all" }} />
      <ActivityRows rows={rows} grouped={false} />
    </section>
  );
}
