import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState, DetailRow } from "@/components/ui/Primitives";
import { ManualDepositQueueActions } from "@/components/admin/ManualDepositQueueActions";
import { signDepositProofUrl } from "@/lib/deposits/proofUrl";
import { formatAmount } from "@/lib/currencies";
import type { Currency } from "@/lib/types/database";

export const metadata = { title: "Deposit queue" };
export const dynamic = "force-dynamic";

/**
 * Manual naira deposits waiting for a human (migration 0037).
 *
 * NOT GATED ON NGN_MANUAL_DEPOSIT. The flag governs whether customers can
 * START a deposit; requests already in this queue still need answering after
 * ops turns it off, and a queue that disappears with the flag would strand
 * them with money sent and no one looking.
 *
 * Everything is read with the service role, which is the only role that can
 * see another user's deposit at all — "deposits: read own" (0001) is still
 * the table's only policy. The screenshots are read the same way: 0037
 * deliberately gives the bucket no admin-side select policy, so each URL is
 * minted here for ten minutes rather than granted standing.
 */
export default async function AdminDepositsPage() {
  await requireAdminUser();

  const admin = createAdminClient();

  // Served by deposits_awaiting_review_idx. Oldest first: a queue worked
  // newest-first leaves the person who has waited longest waiting longest.
  const { data: deposits } = await admin
    .from("deposits")
    .select("*")
    .eq("status", "awaiting_review")
    .eq("method", "manual_bank_transfer")
    .order("marked_sent_at", { ascending: true });

  if (!deposits || deposits.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-semibold text-foreground">Deposit queue</h1>
        <EmptyState
          title="Nothing waiting"
          body="Every naira transfer has been checked."
          action={{ href: "/admin", label: "Back to admin" }}
        />
      </div>
    );
  }

  // One round trip for every profile on the page, and the signed URLs in
  // parallel with it — neither needs the other. `first_approver_id` is
  // folded into the same id list so a half-approved row can name the admin
  // who signed it without a second query.
  const userIds = deposits.map((d) => d.user_id);
  const approverIds = deposits.map((d) => d.first_approver_id).filter((id): id is string => !!id);

  const [{ data: profiles }, proofUrls] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", [...new Set([...userIds, ...approverIds])]),
    Promise.all(deposits.map((d) => signDepositProofUrl(d.screenshot_path))),
  ]);

  const profileFor = (id: string | null) => (id ? profiles?.find((p) => p.id === id) : undefined);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">Deposit queue</h1>

      <p className="text-sm text-muted-foreground">
        Credit the amount that actually reached the account, not the amount the customer asked
        for. Approvals of {formatAmount("NGN", 1_000_000)} or more need a second admin.
      </p>

      <div className="space-y-4">
        {deposits.map((deposit, index) => {
          const profile = profileFor(deposit.user_id);
          const firstApprover = profileFor(deposit.first_approver_id);
          const currency = deposit.currency as Currency;
          const proofUrl = proofUrls[index];

          return (
            <Card key={deposit.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-xl font-semibold tabular-nums text-foreground">
                    {formatAmount(currency, deposit.amount)}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {profile?.full_name ?? profile?.email ?? deposit.user_id}
                  </p>
                </div>
                {/* The reference is what an operator searches the bank
                    statement for, so it is the one thing here set in a
                    monospace face large enough to read across a desk. */}
                <p className="shrink-0 font-mono text-base font-semibold tracking-wider text-foreground">
                  {deposit.reference ?? "—"}
                </p>
              </div>

              <div>
                <DetailRow label="Email">{profile?.email ?? "—"}</DetailRow>
                <DetailRow label="Amount expected">
                  {formatAmount(currency, deposit.amount)}
                </DetailRow>
                <DetailRow label="Marked sent">
                  {deposit.marked_sent_at
                    ? new Date(deposit.marked_sent_at).toLocaleString("en-GB")
                    : "—"}
                </DetailRow>
                <DetailRow label="Requested">
                  {new Date(deposit.created_at).toLocaleString("en-GB")}
                </DetailRow>
              </div>

              {/* A signed URL, good for ten minutes. A missing one means
                  either no screenshot was attached (normal — the upload is
                  optional and the reference is what matches) or storage
                  refused, which is worth saying rather than rendering a
                  broken image. */}
              {deposit.screenshot_path ? (
                proofUrl ? (
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
                  >
                    Open the screenshot
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    A screenshot was attached but couldn&apos;t be opened. Match it by the
                    reference.
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  No screenshot — match it by the reference on the statement.
                </p>
              )}

              <ManualDepositQueueActions
                depositId={deposit.id}
                requestedAmount={String(deposit.amount)}
                firstApproverEmail={firstApprover?.email ?? null}
                firstApprovalAmount={
                  deposit.first_approval_amount != null
                    ? formatAmount(currency, deposit.first_approval_amount)
                    : null
                }
              />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
