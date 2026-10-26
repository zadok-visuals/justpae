import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { SellForm } from "@/components/sell/SellForm";
import { depositAvailability } from "@/lib/deposits/availability";
import { getBanks, type BushaBank } from "@/lib/busha/client";
import type { Wallet, WithdrawalRecipient } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Sell USDT" };
export const dynamic = "force-dynamic";

/**
 * GROUP 3 — /sell, a guided wrapper over the existing convert and withdraw
 * actions. No new money logic lives here or in SellForm: selling is
 * executeConversion(USDT → NGN), optionally followed by requestWithdrawal
 * for NGN, exactly as /convert and /withdraw already run them.
 */
export default async function SellPage() {
  const supabase = await createClient();
  const user = await requireSessionUser();

  const [{ data: wallets }, { data: recipients }, { data: profile }, { data: hasPin }] =
    await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", user.id),
      supabase
        .from("withdrawal_recipients")
        .select("*")
        .eq("user_id", user.id)
        .eq("currency", "NGN"),
      supabase
        .from("profiles")
        .select("kyc_status, kyc_type, phone, kyc_rejection_reason")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.rpc("has_transaction_pin"),
    ]);

  const walletList = (wallets ?? []) as Wallet[];
  const recipient = ((recipients ?? []) as WithdrawalRecipient[])[0] ?? null;

  // Same defensive fallback as /profile's own PayoutRecipients: a bank-list
  // failure must leave the "add a destination" form showing no options
  // rather than taking out the whole page.
  let banks: BushaBank[] = [];
  try {
    banks = await getBanks();
  } catch (err) {
    console.error("[sell] bank list unavailable", err);
  }

  return (
    <PageShell title="Sell USDT" subtitle="Get naira in your bank at today's rate" back={{ href: "/home", label: "Home" }}>
      <SellForm
        usdtWallet={walletList.find((w) => w.currency === "USDT")}
        usdtDepositAvailability={depositAvailability("USDT")}
        recipient={recipient}
        banks={banks}
        hasPin={hasPin === true}
        kycApproved={profile?.kyc_status === "approved"}
        kycStatus={profile?.kyc_status ?? null}
        rejectionReason={profile?.kyc_rejection_reason ?? null}
      />
    </PageShell>
  );
}
