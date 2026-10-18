import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { PayToChinaForm } from "@/components/payToChina/PayToChinaForm";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { SectionHeader } from "@/components/ui/Primitives";
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

  const [{ data: wallets }, { data: saved }, { data: profile }, { data: hasPin }, recent] =
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
      fetchActivityPage(supabase, user.id, { filter: "all" }, 0, 5),
    ]);

  endRouteTiming();

  const payToChinaRows = recent.rows.filter((row) => row.type === "pay_to_china");

  return (
    <PageShell
      title="Pay to China"
      subtitle="Pay a supplier, a landlord or family in China, in yuan."
      back={{ href: "/home", label: "Home" }}
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

      {payToChinaRows.length > 0 && (
        <section className="mt-8">
          <SectionHeader
            title="Recent payments"
            action={{ href: "/transactions", label: "See all" }}
          />
          <ActivityRows rows={payToChinaRows} grouped={false} />
        </section>
      )}
    </PageShell>
  );
}
