import type { SupabaseClient } from "@supabase/supabase-js";
import { listVirtualAccountTransactions } from "@/lib/korapay/client";
import { korapaySettleDeps } from "@/lib/korapay/deps";
import { settleKorapayCharge, type SettleOutcome } from "@/lib/korapay/settle";
import type { Database } from "@/lib/types/database";

/**
 * Crediting virtual-account deposits the webhook never told us about.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS IS THE PRIMARY PATH TODAY, NOT A BACKSTOP
 *
 * No webhook URL is configured in the sandbox dashboard, so in the sandbox
 * nothing is delivered and this is the only way a deposit is ever noticed.
 * In production it is the other way round.
 *
 * BOTH GO THROUGH settleKorapayCharge. Not "the same database function" —
 * the same code path, from the charge query down. The listing is used only
 * to discover which references exist; the amount that credits is read from
 * the charge, exactly as it is on the webhook side, so there is no second
 * place where a figure could be taken from somewhere less trustworthy.
 * credit_korapay_deposit is idempotent on the reference, so the two can run
 * in either order or at the same instant and the wallet moves once.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * IT ITERATES ACCOUNTS, AND THAT IS THE PROVIDER'S CONSTRAINT
 *
 * GET /virtual-bank-account/transactions REFUSES to run without an
 * account_number — confirmed live: "account_number is required". There is no
 * merchant-wide pay-in listing, so one request per account is the only shape
 * available.
 *
 * Two things keep that affordable. The scan is CAPPED per run and ordered
 * oldest-account-first, so it is a rotation rather than a truncation — every
 * account is reached within ceil(accounts / limit) runs. And a reference
 * that already has a deposit row is skipped before the charge query, so a
 * settled account costs one listing request and nothing else.
 */

type AdminClient = SupabaseClient<Database>;

export interface KorapayReconcileResult {
  accountsChecked: number;
  credited: number;
  outcomes: { reference: string; outcome: SettleOutcome }[];
}

/** How many accounts one run will ask the provider about. */
const DEFAULT_ACCOUNT_LIMIT = 50;
/** How many recent transactions per account. */
const TRANSACTIONS_PER_ACCOUNT = 20;

export async function reconcileKorapayDeposits(
  admin: AdminClient,
  options: { accountLimit?: number } = {},
): Promise<KorapayReconcileResult> {
  const accountLimit = options.accountLimit ?? DEFAULT_ACCOUNT_LIMIT;
  const deps = korapaySettleDeps(admin, "korapay reconcile");
  const outcomes: { reference: string; outcome: SettleOutcome }[] = [];
  let credited = 0;

  const { data: accounts, error } = await admin
    .from("virtual_accounts")
    .select("id, user_id, account_number")
    .eq("provider", "korapay")
    .eq("currency", "NGN")
    .order("created_at", { ascending: true })
    .limit(accountLimit);

  if (error) {
    console.error("[korapay reconcile] could not list virtual accounts", error);
    return { accountsChecked: 0, credited: 0, outcomes };
  }

  for (const account of accounts ?? []) {
    let transactions;
    try {
      transactions = await listVirtualAccountTransactions({
        accountNumber: account.account_number,
        limit: TRANSACTIONS_PER_ACCOUNT,
      });
    } catch (err) {
      // One account's lookup failing must not stop the rest. The next run
      // reaches it again.
      console.error("[korapay reconcile] transaction lookup failed", {
        accountId: account.id,
        error: err instanceof Error ? err.message : err,
      });
      continue;
    }

    for (const transaction of transactions) {
      if (transaction.status !== "success") continue;
      const reference = transaction.reference;
      if (!reference) continue;

      // The cheap skip. Almost every transaction on almost every run is one
      // we credited days ago; asking the provider about each of them again
      // would turn a listing call into twenty.
      const { data: existing } = await admin
        .from("deposits")
        .select("id")
        .eq("provider", "korapay")
        .eq("provider_reference", reference)
        .maybeSingle();
      if (existing) continue;

      const outcome = await settleKorapayCharge(deps, reference);
      outcomes.push({ reference, outcome });
      if (outcome === "credited") {
        credited += 1;
        console.warn("[korapay reconcile] credited a deposit the webhook missed", { reference });
      }
    }
  }

  return { accountsChecked: (accounts ?? []).length, credited, outcomes };
}
