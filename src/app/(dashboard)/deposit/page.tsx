import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { DepositForm } from "@/components/deposit/DepositForm";
import { depositAvailability } from "@/lib/deposits/availability";
import { isWalletLocked } from "@/lib/services";
import { parseCurrencyParam, preselectCurrency } from "@/lib/accounts/preselect";
import { startRouteTiming } from "@/lib/perf/timing";
import type { Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Add money" };
export const dynamic = "force-dynamic";

export default async function DepositPage(props: PageProps<"/deposit">) {
  const endRouteTiming = startRouteTiming("/deposit");
  const supabase = await createClient();
  const user = await requireSessionUser();

  const [{ data: wallets }, params] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id),
    props.searchParams,
  ]);
  const list = (wallets ?? []) as Wallet[];

  // GROUP 2c. Belt-and-suspenders with src/proxy.ts's maintenanceRedirect():
  // that one stops a direct URL before this page ever runs; this is the
  // page's own copy of the same check.
  const requested = parseCurrencyParam(params.currency);
  if (requested && isWalletLocked(requested)) redirect("/home");

  // Resolved on the server so the form knows which currencies are depositable
  // before the first render, rather than enabling an option and then rejecting
  // it on submit.
  const availability = Object.fromEntries(
    list.map((wallet) => [wallet.currency, depositAvailability(wallet.currency)]),
  );

  // Home's Add money sheet and every account page link in here with a
  // currency already chosen. Honouring it is what makes those two taps one
  // journey rather than two separate "which wallet?" questions.
  const initialCurrency = preselectCurrency(
    parseCurrencyParam(params.currency),
    list.filter((w) => availability[w.currency]?.available).map((w) => w.currency),
    list.map((w) => w.currency),
  );

  endRouteTiming();

  return (
    <PageShell
      title="Add money"
      subtitle="Send a transfer and we'll credit your wallet."
      back={{ href: "/home", label: "Home" }}
      /* GROUP 6a. The form itself stays 34rem wide — MoneyFormLayout caps it
         — and this is what gives the summary column beside it somewhere to
         live. Without it the shell's 42rem would crush the split. */
      width="split"
    >
      <DepositForm
        wallets={list}
        availability={availability}
        initialCurrency={initialCurrency}
      />
    </PageShell>
  );
}
