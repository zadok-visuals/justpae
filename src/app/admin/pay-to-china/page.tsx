import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState, StatusPill, DetailRow } from "@/components/ui/Primitives";
import {
  PayToChinaQueueActions,
  PayoutDetails,
  AssetPreview,
} from "@/components/admin/PayToChinaQueueActions";
import { payoutDetailFields } from "@/lib/payToChina/describe";
import { formatAmount } from "@/lib/currencies";
import type { Currency, PayToChinaRecipient, TransactionStatus } from "@/lib/types/database";

export const metadata = { title: "Pay to China" };
export const dynamic = "force-dynamic";

/**
 * The Pay to China queue.
 *
 * COMPACT CARDS, NOT A TABLE. Every row here is worked on a phone, in
 * parallel with a Chinese payment app, and a table at 375px either scrolls
 * sideways or crushes the one column that matters. A card can put the two
 * amounts at the top, the transcribable details in the middle with their own
 * copy buttons, and the actions at the bottom.
 *
 * FOUR FILTERS, and "completed" is one of them on purpose: the most common
 * question after the fact is "did we actually pay this one, and what did the
 * receipt look like", which a pending-only queue cannot answer.
 */

const FILTERS: { value: TransactionStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Rejected" },
];

export default async function AdminPayToChinaPage(props: PageProps<"/admin/pay-to-china">) {
  await requireAdminUser();

  const params = await props.searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  const status: TransactionStatus = FILTERS.some((f) => f.value === raw)
    ? (raw as TransactionStatus)
    : "pending";

  const admin = createAdminClient();

  const { data: requests } = await admin
    .from("transactions")
    .select("*")
    .eq("type", "pay_to_china")
    .eq("status", status)
    // Oldest first inside the open states — a queue worked newest-first
    // leaves its oldest request waiting forever. Newest first once settled,
    // because then it is a log and the recent one is the one being looked up.
    .order("created_at", { ascending: status === "pending" || status === "processing" })
    .limit(200);

  const rows = requests ?? [];

  const [{ data: recipients }, { data: profiles }] = await Promise.all([
    rows.length
      ? admin
          .from("pay_to_china_recipients")
          .select("*")
          .in("transaction_id", rows.map((r) => r.id))
      : Promise.resolve({ data: [] as PayToChinaRecipient[] }),
    rows.length
      ? admin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", rows.map((r) => r.user_id))
      : Promise.resolve({ data: [] as { id: string; email: string; full_name: string | null }[] }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">Pay to China</h1>

      <nav aria-label="Status" className="snap-rail -mx-1 flex gap-2 overflow-x-auto px-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/pay-to-china?status=${f.value}`}
            aria-current={status === f.value ? "page" : undefined}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium leading-11 ${
              status === f.value
                ? "border-primary bg-secondary text-foreground"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing here"
          body={
            status === "pending"
              ? "Every request has been picked up."
              : "No requests in this state."
          }
          action={{ href: "/admin", label: "Back to admin" }}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const recipient = recipients?.find((r) => r.transaction_id === row.id);
            const profile = profiles?.find((p) => p.id === row.user_id);
            const settled = row.status === "completed" || row.status === "failed";

            return (
              <li key={row.id}>
                <Card className="space-y-3">
                  {/* The two amounts first and large: what we took, and what
                      has to be paid. Everything else is detail. */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-xl font-semibold tabular-nums text-foreground">
                        {formatAmount("CNY", row.actual_target_amount ?? row.target_amount ?? 0)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        from {formatAmount(row.currency as Currency, row.amount)}
                      </p>
                    </div>
                    <StatusPill status={row.status} />
                  </div>

                  <div className="rounded-lg border border-border bg-secondary px-3 py-2">
                    <DetailRow label="Customer">
                      {profile?.full_name ?? profile?.email ?? row.user_id}
                    </DetailRow>
                    <DetailRow label="Requested">
                      {new Date(row.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </DetailRow>
                  </div>

                  {recipient ? (
                    <div className="rounded-lg border border-border bg-secondary px-3 py-2">
                      <PayoutDetails
                        fields={payoutDetailFields(recipient)}
                        qrRef={recipient.qr_code_ref}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-destructive">
                      The recipient details for this request are missing. Do not pay it — contact
                      the customer.
                    </p>
                  )}

                  {row.decline_reason && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                        Rejected
                      </p>
                      <p className="mt-1 text-sm text-foreground">{row.decline_reason}</p>
                    </div>
                  )}

                  {row.payment_proof_ref && (
                    <AssetPreview
                      bucket="pay-to-china-proof"
                      path={row.payment_proof_ref}
                      label="Payment receipt"
                    />
                  )}

                  {!settled && (
                    <PayToChinaQueueActions
                      transactionId={row.id}
                      status={row.status}
                      targetCny={row.target_amount}
                      userId={row.user_id}
                    />
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
