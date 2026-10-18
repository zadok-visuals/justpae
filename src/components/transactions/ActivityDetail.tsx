"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SheetPanel } from "@/components/ui/SheetPanel";
import { usePolling, isFinalStatus } from "@/lib/hooks/usePolling";
import { DetailRow, SkeletonText, StatusPill } from "@/components/ui/Primitives";
import { CopyButton, CopyField } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";
import { Lightbox } from "@/components/ui/Lightbox";
import { formatAmount, formatNumber, formatRate } from "@/lib/currencies";
import { getActivityDetail, type ActivityDetail as Detail } from "@/lib/actions/activity";
import type { ActivitySource } from "@/lib/transactions";

/**
 * The transaction detail view — a bottom sheet on mobile, a right panel on
 * desktop (see SheetPanel for why neither is a centred modal).
 *
 * Loaded on open rather than with the list, so a page of twenty rows is one
 * query instead of twenty-one.
 */
export function ActivityDetail({
  source,
  id,
  title,
  onClose,
}: {
  source: ActivitySource;
  id: string;
  title: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    getActivityDetail(source, id).then((result) => {
      // The sheet can be closed and another row opened before this resolves;
      // without the guard the first response would overwrite the second.
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setDetail(result.detail ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [source, id]);

  // While it is still pending, keep asking. Deposits were the only thing that
  // polled; a withdrawal or conversion sat on "pending" until the user
  // reloaded the page to find out it had finished half an hour ago.
  const pending = detail !== null && !isFinalStatus(detail.status);
  usePolling(
    async () => {
      const result = await getActivityDetail(source, id);
      if (result.error || !result.detail) return;
      setDetail(result.detail);

      // Reaching a final state means a balance moved, and this sheet is
      // rendered over a server-rendered page holding the old one.
      if (isFinalStatus(result.detail.status)) router.refresh();
    },
    { active: pending },
  );

  return (
    <SheetPanel
      open
      onClose={onClose}
      title={title}
      footer={detail ? <ReceiptButton detail={detail} title={title} /> : undefined}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!detail && !error && (
        <div className="space-y-4 py-2">
          <SkeletonText lines={2} />
          <SkeletonText lines={5} />
        </div>
      )}

      {detail && <DetailBody detail={detail} />}
    </SheetPanel>
  );
}

function DetailBody({ detail }: { detail: Detail }) {
  const isConversion = detail.source === "transaction" && detail.type === "convert";
  const isWithdrawal = detail.source === "transaction" && detail.type === "withdrawal";
  const isBill = detail.source === "bill";
  const isPayToChina = detail.source === "transaction" && detail.type === "pay_to_china";
  const [proofOpen, setProofOpen] = useState(false);

  return (
    <div className="pb-2">
      {/* The headline: the amount and the status, nothing competing with
          them. This is what the person opened the row to see. */}
      <div className="mb-4 flex flex-col items-center gap-2 py-3 text-center">
        <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
          {formatAmount(detail.sourceCurrency, detail.sourceAmount)}
        </p>
        <StatusPill status={detail.status} />
        <p className="text-xs text-muted-foreground">
          {new Date(detail.createdAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* The token is the whole reason an electricity receipt exists: without
          it the customer cannot load the units they just paid for. It goes
          first, large, with its own copy button. */}
      {isBill && detail.token && (
        <div className="mb-4">
          <CopyField label="Meter token" value={detail.token} emphasis />
          {detail.units && (
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              {detail.units} units
            </p>
          )}
        </div>
      )}

      <StatusTimeline detail={detail} />

      {detail.declineReason && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
            Why this failed
          </p>
          <p className="mt-1 text-sm text-foreground">{detail.declineReason}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-secondary px-3">
        {detail.confirmedAmount != null && (
          <DetailRow label="Amount received">
            {formatAmount(detail.sourceCurrency, detail.confirmedAmount)}
          </DetailRow>
        )}

        {isConversion && detail.targetAmount != null && detail.targetCurrency && (
          <DetailRow label="You received">
            {formatAmount(detail.targetCurrency, detail.targetAmount)}
          </DetailRow>
        )}

        {isWithdrawal && detail.targetAmount != null && (
          <DetailRow label="Recipient receives">
            {formatAmount(detail.sourceCurrency, detail.targetAmount)}
          </DetailRow>
        )}

        {isPayToChina && detail.targetAmount != null && (
          <DetailRow label={detail.status === "completed" ? "They received" : "They receive"}>
            {formatAmount("CNY", detail.targetAmount)}
          </DetailRow>
        )}

        {detail.fee != null && detail.fee > 0 && (
          <DetailRow label="Fee">{formatAmount(detail.sourceCurrency, detail.fee)}</DetailRow>
        )}

        {/* The rate breakdown is shown openly rather than rolled into one
            number. A customer who can see the provider rate, the markup and
            the rate they got has no reason to suspect the gap is larger than
            it is. */}
        {isConversion && detail.customerRate != null && detail.targetCurrency && (
          <>
            <DetailRow label="Your rate" mono>
              {formatRate(detail.sourceCurrency, detail.targetCurrency, detail.customerRate)}
            </DetailRow>
            {detail.providerRate != null && (
              <DetailRow label="Market rate" mono>
                {formatRate(detail.sourceCurrency, detail.targetCurrency, detail.providerRate)}
              </DetailRow>
            )}
            {detail.markupRate != null && (
              <DetailRow label="Our spread">
                {formatNumber(detail.markupRate * 100, 2)}%
              </DetailRow>
            )}
          </>
        )}

        {detail.description && (
          <DetailRow label={isBill ? "Paid to" : isWithdrawal ? "Sent to" : "Details"} mono>
            {detail.description}
          </DetailRow>
        )}

        {detail.reference && (
          <DetailRow label="Reference">
            <span className="inline-flex items-center gap-2">
              <span className="break-all font-mono text-xs">{detail.reference}</span>
              <CopyButton value={detail.reference} label="Copy" />
            </span>
          </DetailRow>
        )}

        {detail.balanceAfter != null && (
          <DetailRow
            // "New balance" would be a lie once something later has moved this
            // currency, so the label changes rather than the number being
            // presented as something it isn't.
            label={detail.isMostRecent ? "New balance" : "Current balance"}
          >
            {formatAmount(
              detail.targetCurrency && isConversion ? detail.targetCurrency : detail.sourceCurrency,
              detail.balanceAfter,
            )}
          </DetailRow>
        )}
      </div>

      {isWithdrawal && detail.requiresExtraVerification && detail.status !== "completed" && (
        <p className="mt-3 text-sm text-muted-foreground">
          This withdrawal is above our instant limit, so our team reviews it before it goes out.
        </p>
      )}

      {isPayToChina && !isFinalStatus(detail.status) && (
        <p className="mt-3 text-sm text-muted-foreground">
          Our team pays these by hand, so it isn&apos;t instant. We&apos;ll email you when
          it&apos;s on its way and again with the receipt once it lands.
        </p>
      )}

      {/* THE PROOF OF PAYMENT. A manual payout's whole credibility problem is
          that the customer has only our word for it; a photograph of the
          payment landing in the recipient's app is the answer. Thumbnail
          here, full size in a lightbox, from a signed URL that expires. */}
      {isPayToChina && detail.proofUrl && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payment receipt
          </p>
          <button
            type="button"
            onClick={() => setProofOpen(true)}
            className="block w-full overflow-hidden rounded-xl border border-border"
          >
            {/* A short-lived signed storage URL — nothing next/image can
                optimise, and deliberately so. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={detail.proofUrl}
              alt="Proof that your payment reached your recipient"
              className="max-h-60 w-full object-contain"
            />
          </button>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">Tap to enlarge</p>
          <Lightbox
            open={proofOpen}
            src={detail.proofUrl}
            alt="Proof that your payment reached your recipient"
            onClose={() => setProofOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The status timeline. Three or four fixed steps rather than a log, because
 * what a user wants from this is "where is my money right now", not an audit
 * trail.
 */
function StatusTimeline({ detail }: { detail: Detail }) {
  const failed = detail.status === "failed" || detail.status === "refunded";
  const done = detail.status === "completed";
  const inFlight = detail.status === "processing";

  const isPayToChina = detail.source === "transaction" && detail.type === "pay_to_china";

  const steps = [
    { label: isPayToChina ? "Requested" : "Created", state: "done" as const },
    {
      label:
        detail.source === "deposit"
          ? "Funds received"
          : isPayToChina
            ? // A person is doing this one, and saying "sent to provider"
              // about a human would be both wrong and unreassuring.
              "Being paid in China"
            : "Sent to provider",
      state: done || inFlight ? ("done" as const) : failed ? ("failed" as const) : ("current" as const),
    },
    {
      label:
        detail.status === "refunded"
          ? "Refunded"
          : failed
            ? isPayToChina
              ? "Returned to your wallet"
              : "Failed"
            : isPayToChina
              ? "Paid"
              : "Completed",
      state: done
        ? ("done" as const)
        : failed
          ? ("failed" as const)
          : ("pending" as const),
    },
  ];

  return (
    <ol className="mb-4 space-y-2.5">
      {steps.map((step) => (
        <li key={step.label} className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 rounded-full ${
              step.state === "done"
                ? "bg-success"
                : step.state === "failed"
                  ? "bg-destructive"
                  : step.state === "current"
                    ? "bg-primary"
                    : "bg-muted"
            }`}
          />
          <span
            className={`text-sm ${
              step.state === "pending" ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Download receipt.
 *
 * Generated client-side as a plain text file rather than a PDF: a PDF needs a
 * library in the bundle for something a user forwards to support or keeps for
 * their records, and text is readable everywhere including on a feature phone
 * mail client.
 */
function ReceiptButton({ detail, title }: { detail: Detail; title: string }) {
  function download() {
    const lines = [
      "justpae receipt",
      "",
      title,
      `Date: ${new Date(detail.createdAt).toLocaleString("en-GB")}`,
      `Status: ${detail.status}`,
      `Amount: ${formatAmount(detail.sourceCurrency, detail.sourceAmount)}`,
    ];

    if (detail.confirmedAmount != null) {
      lines.push(`Received: ${formatAmount(detail.sourceCurrency, detail.confirmedAmount)}`);
    }
    if (detail.targetAmount != null && detail.targetCurrency) {
      lines.push(`Converted to: ${formatAmount(detail.targetCurrency, detail.targetAmount)}`);
    }
    if (detail.fee != null && detail.fee > 0) {
      lines.push(`Fee: ${formatAmount(detail.sourceCurrency, detail.fee)}`);
    }
    if (detail.customerRate != null && detail.targetCurrency) {
      lines.push(
        `Rate: ${formatRate(detail.sourceCurrency, detail.targetCurrency, detail.customerRate)}`,
      );
    }
    if (detail.description) lines.push(`Details: ${detail.description}`);
    if (detail.token) lines.push(`Token: ${detail.token}`);
    if (detail.reference) lines.push(`Reference: ${detail.reference}`);
    if (detail.declineReason) lines.push(`Note: ${detail.declineReason}`);

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `justpae-receipt-${detail.createdAt.slice(0, 10)}.txt`;
    anchor.click();
    // Revoked immediately after the click: the blob is already handed to the
    // download, and leaving it alive leaks the buffer for the page's lifetime.
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="secondary" fullWidth onClick={download}>
      Download receipt
    </Button>
  );
}
