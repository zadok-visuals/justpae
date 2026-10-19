"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SheetPanel } from "@/components/ui/SheetPanel";
import { usePolling, isFinalStatus } from "@/lib/hooks/usePolling";
import { DetailRow, SkeletonText, StatusPill } from "@/components/ui/Primitives";
import { CopyButton, CopyField } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";
import { Lightbox } from "@/components/ui/Lightbox";
import { formatAmount, formatNumber, formatRate } from "@/lib/currencies";
import { getActivityDetail } from "@/lib/actions/activity";
// The TYPE comes from the plain module, the ACTION from the "use server" one.
// A `"use server"` file may only export async functions, so it is not a place
// a shared type can live.
import type { ActivityDetail as Detail } from "@/lib/activity/detail";
import { receiptFilename } from "@/lib/activity/receiptTitle";
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
      footer={detail ? <ReceiptButton detail={detail} source={source} id={id} /> : undefined}
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
  const isDeposit = detail.source === "deposit";
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
            //
            // GROUP 4b adds the second half of that rule. "New balance" also
            // claimed a balance this row had PRODUCED — on a deposit that has
            // not been credited yet and may never be. The figure shown is the
            // wallet's balance right now, which on a pending deposit is the
            // balance from BEFORE it: calling that "new" invites the reader to
            // conclude the money already landed. A deposit earns the label
            // only once it is actually completed.
            label={
              detail.isMostRecent && (!isDeposit || detail.status === "completed")
                ? "New balance"
                : "Current balance"
            }
          >
            {formatAmount(
              detail.targetCurrency && isConversion ? detail.targetCurrency : detail.sourceCurrency,
              detail.balanceAfter,
            )}
          </DetailRow>
        )}
      </div>

      {/* An expired deposit's one useful action. Without it the sheet is a
          dead end: the details on it are unusable, and nothing on screen says
          what to do instead. */}
      {isDeposit && detail.status === "expired" && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-muted-foreground">
            These transfer details expired before any money arrived, so nothing was taken.
            Start again and we&apos;ll generate fresh details for you.
          </p>
          <Link
            href={`/deposit?currency=${detail.sourceCurrency}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Start a new deposit
          </Link>
        </div>
      )}

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

type StepState = "done" | "current" | "pending" | "failed";

/**
 * The status timeline. Three fixed steps rather than a log, because what a
 * user wants from this is "where is my money right now", not an audit trail.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GROUP 4b — WHAT A PENDING DEPOSIT USED TO CLAIM
 *
 * Every row type shared one middle step whose state was derived purely from
 * the transaction status, and for a deposit that produced a sentence that was
 * not true. A deposit sitting at 'pending' — the user has been given transfer
 * details and has not sent anything yet — rendered:
 *
 *      ● Created
 *      ● Funds received          ← marked CURRENT, in the accent colour
 *      ○ Completed
 *
 * "Funds received", lit up as the step happening right now, on a deposit
 * where no funds have been received and the product is waiting on the
 * CUSTOMER to act. It is the one screen where the app knows the next move is
 * theirs, and it was telling them the opposite.
 *
 * So a deposit now gets its own ladder:
 *
 *   pending    → "Waiting for your transfer" is current; "Funds received"
 *                has not happened and is shown as pending.
 *   processing → the provider has seen the money. "Funds received" is done,
 *                "Completed" is current.
 *   completed  → all three done.
 *   expired    → the window closed with nothing received (migration 0029).
 *                Shown as its own terminal step, neutral rather than red,
 *                with the only useful action beside it.
 *
 * Everything that is not a deposit keeps the ladder it had.
 */
function StatusTimeline({ detail }: { detail: Detail }) {
  const failed = detail.status === "failed" || detail.status === "refunded";
  const done = detail.status === "completed";
  const inFlight = detail.status === "processing";
  const expired = detail.status === "expired";

  const isPayToChina = detail.source === "transaction" && detail.type === "pay_to_china";
  const isDeposit = detail.source === "deposit";

  const steps: { label: string; state: StepState }[] = isDeposit
    ? [
        { label: "Deposit started", state: "done" },
        {
          // THE FIX. Before any money has arrived this says what is actually
          // true and whose move it is. It only becomes "Funds received" once
          // the provider has told us so — which is what moves the row to
          // 'processing' or 'completed'.
          label: done || inFlight ? "Funds received" : expired ? "No transfer received" : "Waiting for your transfer",
          state: done || inFlight ? "done" : expired ? "failed" : failed ? "failed" : "current",
        },
        {
          label: expired ? "Expired" : failed ? "Failed" : "Completed",
          // An expired deposit's last step is reached, not pending — the row
          // is finished. Rendering it as a hollow "pending" dot would say the
          // opposite of what the status pill beside it says.
          state: done ? "done" : expired ? "failed" : failed ? "failed" : "pending",
        },
      ]
    : [
        { label: isPayToChina ? "Requested" : "Created", state: "done" },
        {
          label: isPayToChina
            ? // A person is doing this one, and saying "sent to provider"
              // about a human would be both wrong and unreassuring.
              "Being paid in China"
            : "Sent to provider",
          state: done || inFlight ? "done" : failed ? "failed" : "current",
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
          state: done ? "done" : failed ? "failed" : "pending",
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
 * GROUP 4a — the receipt, downloaded as a branded PNG, and shared on mobile.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACED, AND WHY THE .TXT HAD TO GO
 *
 * The previous version built a plain-text file in the browser from the props
 * already on screen. Cheap, and wrong for what a receipt is for: the one
 * thing a customer does with it is send it to somebody else as proof — a
 * supplier, a landlord, a support queue — and an unbranded .txt proves
 * nothing. It is also indistinguishable from a file they typed themselves.
 *
 * The image is rendered by /api/receipts/<source>/<id>, which re-reads the
 * row from the database and checks ownership. So the download is also a
 * freshness guarantee: the figures on the saved receipt are the ledger's at
 * the moment of download, not whatever this sheet last polled.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THE FILE IS FETCHED RATHER THAN LINKED
 *
 * `<a href={url} download>` is one line and would be enough on a desktop. It
 * is not enough here: the `download` attribute is ignored cross-origin, and
 * more importantly a fetched Blob is the only form the Web Share API accepts
 * as a file. Fetching once and using the same Blob for both paths means the
 * phone's share sheet gets a real PNG to hand to WhatsApp, rather than a URL
 * that the recipient cannot open because it needs the sender's session.
 *
 * SHARE IS OFFERED, NOT ASSUMED. `navigator.share` exists on desktop Safari
 * and some desktop Chrome builds but usually cannot take files, so the
 * capability is tested with `canShare({ files })` — the only check that
 * actually answers the question — and the button falls back to a download
 * when it says no.
 */
/** Never fires: the answer cannot change for the life of the document. */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * Whether this browser can share FILES — not merely whether `navigator.share`
 * exists. Desktop Safari and some desktop Chrome builds expose `share` but
 * reject files, so `canShare({ files })` is the only check that answers the
 * question actually being asked.
 *
 * Memoised because useSyncExternalStore calls getSnapshot on every render and
 * compares by identity; building a probe File each time would be wasteful,
 * and the answer is a constant anyway.
 */
let fileShareSupportedCache: boolean | null = null;
function fileShareSupported(): boolean {
  if (fileShareSupportedCache !== null) return fileShareSupportedCache;
  try {
    const probe = new File([new Blob(["x"])], "probe.png", { type: "image/png" });
    fileShareSupportedCache =
      typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  } catch {
    // Some engines throw on `new File` in odd contexts rather than returning
    // false. A thrown probe means "no", not a broken receipt button.
    fileShareSupportedCache = false;
  }
  return fileShareSupportedCache;
}

function ReceiptButton({
  detail,
  source,
  id,
}: {
  detail: Detail;
  source: ActivitySource;
  id: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Feature detection that is correct on BOTH renders.
  //
  // `navigator` does not exist on the server, so this cannot be read during
  // render; and setting it from an effect is a cascading render React's lint
  // rule rightly rejects. useSyncExternalStore is the construct built for
  // exactly this shape: a value that differs between server and client and
  // never changes afterwards. The server snapshot is `false` (no share
  // button in the HTML), the client snapshot is the real answer, and React
  // reconciles the two without a hydration mismatch.
  const canShare = useSyncExternalStore(subscribeNever, fileShareSupported, () => false);

  async function fetchReceipt(): Promise<File> {
    const response = await fetch(`/api/receipts/${source}/${id}`);
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "We couldn't find that receipt."
          : "We couldn't produce that receipt just now. Try again in a moment.",
      );
    }
    const blob = await response.blob();
    return new File([blob], receiptFilename(detail.reference, id), { type: "image/png" });
  }

  async function run(share: boolean) {
    setBusy(true);
    setError(null);
    try {
      const file = await fetchReceipt();

      if (share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "justpae receipt" });
          return;
        } catch (shareError) {
          // A cancelled share sheet throws AbortError. That is the user
          // changing their mind, not a failure, and showing them an error
          // for it would be a lie.
          if ((shareError as Error)?.name === "AbortError") return;
          // Anything else: fall through to the download below rather than
          // leaving them with no receipt at all.
        }
      }

      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" fullWidth disabled={busy} onClick={() => run(false)}>
          {busy ? "Preparing…" : "Download receipt"}
        </Button>
        {canShare && (
          <Button variant="secondary" disabled={busy} onClick={() => run(true)}>
            Share
          </Button>
        )}
      </div>
    </div>
  );
}
