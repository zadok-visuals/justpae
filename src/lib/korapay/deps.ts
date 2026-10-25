import type { SupabaseClient } from "@supabase/supabase-js";
import { chargeAccountNumber, getCharge } from "@/lib/korapay/client";
import { notifyDepositCredited } from "@/lib/notify/events";
import type { CreditResult, SettleCharge, SettleDeps } from "@/lib/korapay/settle";
import type { Database } from "@/lib/types/database";

/**
 * The real wiring for settleKorapayCharge.
 *
 * Kept apart from settle.ts so that file can stay import-free and therefore
 * testable under `node --test`, and apart from the route so the reconcile
 * cron can use exactly the same dependencies rather than a second set that
 * drifts. There is one way a virtual-account deposit credits.
 */
export function korapaySettleDeps(
  admin: SupabaseClient<Database>,
  context: string,
): SettleDeps {
  return {
    async getCharge(reference: string): Promise<SettleCharge> {
      const charge = await getCharge(reference);
      return {
        reference: charge.reference,
        status: charge.status,
        currency: charge.currency,
        amount: charge.amount,
        fee: charge.fee,
        accountNumber: chargeAccountNumber(charge),
      };
    },

    async findAccountByNumber(accountNumber: string) {
      const { data } = await admin
        .from("virtual_accounts")
        .select("id, user_id")
        .eq("provider", "korapay")
        .eq("account_number", accountNumber)
        .maybeSingle();
      return data ? { id: data.id, userId: data.user_id } : null;
    },

    async credit(input) {
      const { data, error } = await admin.rpc("credit_korapay_deposit", {
        p_user_id: input.userId,
        p_virtual_account_id: input.virtualAccountId,
        p_provider_reference: input.reference,
        p_currency: "NGN",
        p_gross_amount: input.grossAmount,
        p_provider_fee: input.providerFee,
      });
      if (error) return { error: error.message };
      return { result: (data ?? "already_credited") as CreditResult };
    },

    async notify(reference: string) {
      const { data: deposit } = await admin
        .from("deposits")
        .select("id")
        .eq("provider", "korapay")
        .eq("provider_reference", reference)
        .maybeSingle();

      // notifyDepositCredited claims the row before sending, so the webhook
      // and the cron cannot both announce the same deposit. It never throws,
      // so it cannot turn a successful credit into a non-2xx that gets the
      // whole delivery retried.
      if (deposit) await notifyDepositCredited(deposit.id);
    },

    log(level, message, detail) {
      const line = `[${context}] ${message}`;
      if (level === "error") console.error(line, detail);
      else console.warn(line, detail);
    },
  };
}
