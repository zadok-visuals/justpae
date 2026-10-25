import type { SupabaseClient } from "@supabase/supabase-js";
import { disburseToBank, getAvailableBalance as korapayBalance } from "@/lib/korapay/client";
import { getAvailableBalance as bushaBalance } from "@/lib/busha/client";
import { adminNotificationRecipients, sendAdminSweepEmail } from "@/lib/email";
import { formatAmount } from "@/lib/currencies";
import type { SweepDeps } from "@/lib/treasury/run";
import type { SweepSettings } from "@/lib/treasury/sweep";
import type { Database } from "@/lib/types/database";

/**
 * The real wiring for runSweep.
 *
 * DEPOSIT BALANCE is Korapay's, where virtual-account naira lands. PAYOUT
 * BALANCE is Busha's, which is where withdrawals leave from — the Busha
 * figure only moves once the bank transfer actually arrives, which is why
 * the email says so.
 */
export function sweepDeps(
  admin: SupabaseClient<Database>,
  settings: SweepSettings,
  context: string,
): SweepDeps {
  return {
    depositBalance: () => korapayBalance("NGN").catch(() => null),
    payoutBalance: () => bushaBalance("NGN").catch(() => null),

    async sweptToday(lagosDate) {
      const { data } = await admin
        .from("treasury_movements")
        .select("amount")
        .eq("currency", "NGN")
        .eq("occurred_on", lagosDate)
        .neq("status", "failed");
      const rows = data ?? [];
      return {
        total: rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
        count: rows.length,
      };
    },

    async record(input) {
      const { data, error } = await admin.rpc("record_treasury_movement", {
        p_currency: "NGN",
        p_amount: input.amount,
        p_from_account: "Korapay NGN balance",
        p_to_account: `Busha funding account ${settings.accountNumber}`,
        p_reference: input.reference,
        p_source: input.source,
        p_occurred_on: input.lagosDate,
        p_note: null,
        p_created_by: input.adminId ?? null,
      });
      if (error) {
        // Not recorded means not sent. The whole no-double-sweep argument
        // rests on this call having happened.
        console.error(`[${context}] could not record the movement`, { error });
        return null;
      }
      // `.id`, not the row itself: a plpgsql function returning a composite
      // hands back a row of NULLs when its insert wrote nothing, and over
      // PostgREST that is a truthy object. Reading it as "recorded" would be
      // a second transfer.
      return data?.id ? { id: data.id } : null;
    },

    async send(input) {
      const sent = await disburseToBank({
        reference: input.reference,
        amount: input.amount,
        currency: "NGN",
        bankCode: settings.bankCode,
        accountNumber: settings.accountNumber,
        narration: "justpae treasury sweep",
        customerName: settings.accountName,
      });
      return { status: sent.status };
    },

    async settle(reference, status, providerReference) {
      await admin.rpc("settle_treasury_movement", {
        p_reference: reference,
        p_status: status,
        p_provider_reference: providerReference ?? null,
      });
    },

    async emailAdmins(input) {
      const to = adminNotificationRecipients();
      if (to.length === 0) return;
      await sendAdminSweepEmail({
        to,
        amount: formatAmount("NGN", input.amount),
        automatic: input.automatic,
        depositBalance: formatAmount("NGN", input.depositBalance),
        payoutBalance: formatAmount("NGN", input.payoutBalance),
      });
    },

    log(level, message, detail) {
      const line = `[${context}] ${message}`;
      if (level === "error") console.error(line, detail);
      else console.warn(line, detail);
    },
  };
}
