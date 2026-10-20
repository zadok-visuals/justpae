import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { WithdrawForm } from "@/components/withdraw/WithdrawForm";
import { isWalletLocked } from "@/lib/services";
import { parseCurrencyParam, preselectCurrency } from "@/lib/accounts/preselect";
import type { Wallet, WithdrawalRecipient } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Withdraw" };
export const dynamic = "force-dynamic";

export default async function WithdrawPage(props: PageProps<"/withdraw">) {
  const supabase = await createClient();
  const user = await requireSessionUser();

  const params = await props.searchParams;

  // GROUP 2c.
  const requestedCurrency = parseCurrencyParam(params.currency);
  if (requestedCurrency && isWalletLocked(requestedCurrency)) redirect("/home");

  // See the note in /convert: withdrawal_pins is no longer readable by a user
  // session, because reading it meant being able to read pin_hash.
  const [{ data: wallets }, { data: recipients }, { data: profile }, { data: hasPin }] =
    await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", user.id),
      supabase.from("withdrawal_recipients").select("*").eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("kyc_status, kyc_type, phone, kyc_rejection_reason")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.rpc("has_transaction_pin"),
    ]);

  const walletList = (wallets ?? []) as Wallet[];
  const recipientList = (recipients ?? []) as WithdrawalRecipient[];

  // "Usable" here means a wallet with somewhere to send the money. Arriving
  // from /accounts/NGN preselects naira; arriving from /accounts/USD — which
  // cannot be withdrawn at all — falls back rather than opening a form that
  // is guaranteed to refuse.
  const initialCurrency = preselectCurrency(
    parseCurrencyParam(params.currency),
    walletList
      .filter((w) => recipientList.some((r) => r.currency === w.currency))
      .map((w) => w.currency),
    walletList.map((w) => w.currency),
  );

  return (
    <PageShell
      title="Withdraw"
      subtitle="Send money out to your bank, mobile money or wallet."
      back={{ href: "/home", label: "Home" }}
      /* GROUP 6a — room for MoneyFormLayout's summary column. The form itself
         is still capped at 34rem by that component. */
      width="split"
    >
      <WithdrawForm
        wallets={walletList}
        recipients={recipientList}
        initialCurrency={initialCurrency}
        hasPin={hasPin === true}
        // Checked here for the UI only. create_withdrawal_request checks it
        // again in SQL, which is the check that actually holds — this one just
        // avoids presenting a form that is guaranteed to be rejected.
        kycApproved={profile?.kyc_status === "approved"}
        // Not whether to gate — how to get OUT of the gate. The banner points
        // at stage one or at the matching ID form depending on how far this
        // user actually got.
        kycStatus={profile?.kyc_status ?? null}
        kycType={profile?.kyc_type ?? null}
        hasBasics={Boolean(profile?.phone && profile?.kyc_type)}
        rejectionReason={profile?.kyc_rejection_reason ?? null}
      />
    </PageShell>
  );
}
