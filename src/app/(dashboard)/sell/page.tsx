import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { SellForm } from "@/components/sell/SellForm";
import type { Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Sell USDT" };
export const dynamic = "force-dynamic";

/**
 * GROUP — sell orders (migration 0046). USDT in, fiat credited to the
 * customer's OWN wallet — never a bank, never anyone else's. See
 * src/lib/sellOrders and src/lib/actions/sellOrders.ts for the flow this
 * page drives.
 */
export default async function SellPage() {
  const supabase = await createClient();
  const user = await requireSessionUser();

  const [{ data: wallets }, { data: hasPin }] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id),
    supabase.rpc("has_transaction_pin"),
  ]);

  return (
    <PageShell
      title="Sell USDT"
      subtitle="USDT in, naira in your wallet — withdraw it whenever you're ready."
      back={{ href: "/home", label: "Home" }}
    >
      <SellForm wallets={(wallets ?? []) as Wallet[]} hasPin={hasPin === true} />
    </PageShell>
  );
}
