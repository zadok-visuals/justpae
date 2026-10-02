import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState, Pill, DetailRow, StatusPill } from "@/components/ui/Primitives";
import { WithdrawalQueueActions } from "@/components/admin/QueueActions";
import { formatAmount } from "@/lib/currencies";
import type { Currency } from "@/lib/types/database";

export const metadata = { title: "Withdrawal queue" };
export const dynamic = "force-dynamic";

export default async function AdminWithdrawalsPage(props: PageProps<"/admin/withdrawals">) {
  await requireAdminUser();

  const params = await props.searchParams;
  const filter = Array.isArray(params.filter) ? params.filter[0] : params.filter;

  const admin = createAdminClient();

  let query = admin
    .from("transactions")
    .select("*")
    .eq("type", "withdrawal")
    .in("status", ["pending", "processing"]);

  if (filter === "flagged") {
    query = query.eq("requires_extra_verification", true).is("extra_verification_confirmed_at", null);
  }
  if (filter === "broken") {
    // Automation that failed before a provider transfer existed. Without this
    // view these rows are indistinguishable from a legitimately-manual
    // above-threshold withdrawal and sit here forever.
    query = query.not("automated_payout_attempt_failed_reason", "is", null);
  }

  const { data: withdrawals } = await query.order("created_at");

  if (!withdrawals || withdrawals.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-semibold text-foreground">Withdrawal queue</h1>
        <EmptyState
          title="Nothing waiting"
          body="Every withdrawal has been handled."
          action={{ href: "/admin", label: "Back to admin" }}
        />
      </div>
    );
  }

  // Recipients for the whole page in one query, keyed by user AND currency —
  // a user can have one per currency, and keying by user alone would show an
  // NGN bank account on a USDT withdrawal.
  const { data: recipients } = await admin
    .from("withdrawal_recipients")
    .select("*")
    .in(
      "user_id",
      withdrawals.map((w) => w.user_id),
    );

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in(
      "id",
      withdrawals.map((w) => w.user_id),
    );

  const recipientFor = (userId: string, currency: Currency) =>
    recipients?.find((r) => r.user_id === userId && r.currency === currency);
  const profileFor = (userId: string) => profiles?.find((p) => p.id === userId);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Withdrawal queue
        {filter === "flagged" && " · needs verification"}
        {filter === "broken" && " · automation failed"}
      </h1>

      <div className="space-y-4">
        {withdrawals.map((withdrawal) => {
          const profile = profileFor(withdrawal.user_id);
          const recipient = recipientFor(withdrawal.user_id, withdrawal.currency);

          return (
            <Card key={withdrawal.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-xl font-semibold tabular-nums text-foreground">
                    {formatAmount(withdrawal.currency, withdrawal.amount)}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {profile?.full_name ?? profile?.email ?? withdrawal.user_id}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <StatusPill status={withdrawal.status} />
                  {withdrawal.requires_extra_verification &&
                    !withdrawal.extra_verification_confirmed_at && (
                      <Pill tone="pending">Needs verification</Pill>
                    )}
                  {withdrawal.automated_payout_attempt_failed_reason && (
                    <Pill tone="failed">Automation failed</Pill>
                  )}
                </div>
              </div>

              <div>
                {withdrawal.target_amount != null && (
                  <DetailRow label="Recipient receives">
                    {formatAmount(withdrawal.currency, withdrawal.target_amount)}
                  </DetailRow>
                )}
                {withdrawal.fee != null && (
                  <DetailRow label="Fee">
                    {formatAmount(withdrawal.currency, withdrawal.fee)}
                  </DetailRow>
                )}
                {recipient && (
                  <DetailRow label="Destination" mono>
                    {recipient.wallet_address
                      ? `${recipient.network ?? "BSC"} · ${recipient.wallet_address}`
                      : [
                          recipient.bank_name,
                          recipient.bank_account_number,
                          recipient.account_holder_name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </DetailRow>
                )}
                <DetailRow label="Requested">
                  {new Date(withdrawal.created_at).toLocaleString("en-GB")}
                </DetailRow>
                {withdrawal.automated_payout_attempt_failed_reason && (
                  <DetailRow label="Automation error">
                    {withdrawal.automated_payout_attempt_failed_reason}
                    {withdrawal.automated_payout_retry_count > 0 &&
                      ` (${withdrawal.automated_payout_retry_count} attempts)`}
                  </DetailRow>
                )}
              </div>

              <WithdrawalQueueActions
                transactionId={withdrawal.id}
                requiresVerification={withdrawal.requires_extra_verification}
                verified={withdrawal.extra_verification_confirmed_at != null}
              />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
