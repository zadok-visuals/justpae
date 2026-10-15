import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/layout/PageShell";
import { DepositForm } from "@/components/deposit/DepositForm";
import { depositAvailability } from "@/lib/deposits/availability";
import { localCurrencyForCountry } from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";

export const metadata = { title: "Add money" };
export const dynamic = "force-dynamic";

export default async function DepositPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: wallets } = await supabase.from("wallets").select("*").eq("user_id", user.id);

  // Auto-provision wallets if the signup trigger didn't run (e.g. a user created
  // via a batch import, an admin panel, or before the trigger was added).
  // Use upsert so running this multiple times is safe.
  if (!wallets || wallets.length === 0) {
    const admin = createAdminClient();

    // Read the user's country from their profile to decide the local wallet.
    const { data: profile } = await admin
      .from("profiles")
      .select("country")
      .eq("id", user.id)
      .maybeSingle();

    const localCurrency = localCurrencyForCountry(profile?.country);

    const walletsToCreate: { user_id: string; currency: Currency }[] = [
      { user_id: user.id, currency: "USD" },
      { user_id: user.id, currency: "USDT" },
    ];
    if (localCurrency) {
      walletsToCreate.push({ user_id: user.id, currency: localCurrency });
    }

    await admin.from("wallets").upsert(walletsToCreate, { onConflict: "user_id,currency" });

    // Re-fetch after provisioning.
    const { data: reprovisionedWallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user.id);
    wallets = reprovisionedWallets;
  }

  const list = (wallets ?? []) as Wallet[];

  // Resolved on the server so the form knows which currencies are depositable
  // before the first render, rather than enabling an option and then rejecting
  // it on submit.
  const availability = Object.fromEntries(
    list.map((wallet) => [wallet.currency, depositAvailability(wallet.currency)]),
  );

  return (
    <PageShell
      title="Add money"
      subtitle="Send a transfer and we'll credit your wallet."
      back={{ href: "/home", label: "Home" }}
    >
      <DepositForm wallets={list} availability={availability} />
    </PageShell>
  );
}
