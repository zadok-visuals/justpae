import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { DepositForm } from "@/components/deposit/DepositForm";
import { depositAvailability } from "@/lib/deposits/availability";
import type { Wallet } from "@/lib/types/database";

export const metadata = { title: "Add money" };
export const dynamic = "force-dynamic";

export default async function DepositPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: wallets } = await supabase.from("wallets").select("*").eq("user_id", user.id);
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
