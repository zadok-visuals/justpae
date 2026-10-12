import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { WithdrawForm } from "@/components/withdraw/WithdrawForm";
import type { Wallet, WithdrawalRecipient } from "@/lib/types/database";

export const metadata = { title: "Withdraw" };
export const dynamic = "force-dynamic";

export default async function WithdrawPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  return (
    <PageShell
      title="Withdraw"
      subtitle="Send money out to your bank, mobile money or wallet."
      back={{ href: "/home", label: "Home" }}
    >
      <WithdrawForm
        wallets={(wallets ?? []) as Wallet[]}
        recipients={(recipients ?? []) as WithdrawalRecipient[]}
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
