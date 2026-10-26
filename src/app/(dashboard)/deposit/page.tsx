import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { DepositForm } from "@/components/deposit/DepositForm";
import { depositAvailability } from "@/lib/deposits/availability";
import { isWalletLocked } from "@/lib/services";
import { parseCurrencyParam, preselectCurrency } from "@/lib/accounts/preselect";
import { startRouteTiming } from "@/lib/perf/timing";
import { getManualDepositConfig } from "@/lib/settings";
import { KORAPAY_NGN_DEPOSIT } from "@/lib/flags";
import {
  getNgnVirtualAccount,
  loadNgnVirtualAccount,
  type VirtualAccountState,
} from "@/lib/korapay/virtualAccount";
import type { Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";

export const metadata = { title: "Deposit" };
export const dynamic = "force-dynamic";

export default async function DepositPage(props: PageProps<"/deposit">) {
  const endRouteTiming = startRouteTiming("/deposit");
  const supabase = await createClient();
  const user = await requireSessionUser();

  // GROUP 4. The naira rail needs the profile's KYC state and the receiving
  // account, both read server-side: the gate must not be a client-side
  // decision, and the account number shown must be one the server chose.
  // In parallel with the wallets read — none of the four needs another.
  const [{ data: wallets }, params, { data: profile }, manualConfig, admin] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id),
    props.searchParams,
    supabase.from("profiles").select("kyc_status").eq("id", user.id).maybeSingle(),
    getManualDepositConfig(),
    isAdmin(user.id, user.email),
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

  /**
   * GROUP 2 — the naira account number, resolved server-side.
   *
   * ISSUED HERE ONLY WHEN NAIRA IS THE CURRENCY BEING DEPOSITED INTO. The
   * read is cheap and safe for everyone; the PROVIDER CALL creates a real
   * object at a real bank, and making one for somebody who opened this
   * screen to deposit USDT is waste that the sandbox's account cap makes
   * expensive. A customer who switches to naira after the page renders gets
   * the button in NgnAccountNumber instead.
   */
  let ngnAccount: { state: VirtualAccountState; depositFee: number } | undefined;
  if (KORAPAY_NGN_DEPOSIT && list.some((w) => w.currency === "NGN")) {
    const state =
      initialCurrency === "NGN"
        ? await getNgnVirtualAccount(user.id)
        : await loadNgnVirtualAccount(user.id);
    // The same setting the manual rail quotes. One naira deposit fee, not
    // two that drift — see migration 0040.
    ngnAccount = { state, depositFee: manualConfig.fee };
  }

  endRouteTiming();

  return (
    <PageShell
      title="Deposit"
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
        manualDeposit={{
          userId: user.id,
          kycStatus: profile?.kyc_status ?? "not_started",
          config: manualConfig,
        }}
        ngnAccount={ngnAccount}
        isAdmin={admin}
      />
    </PageShell>
  );
}
