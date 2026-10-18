"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/ui/Button";
import { FieldError, TextAreaField, TextField } from "@/components/ui/Field";
import { Lightbox } from "@/components/ui/Lightbox";
import { CopyButton } from "@/components/ui/CopyButton";
import {
  startPayToChina,
  completePayToChina,
  rejectPayToChina,
  createPayToChinaProofUploadUrl,
  signPayToChinaAsset,
} from "@/lib/actions/adminPayToChina";
import type { PayoutField } from "@/lib/payToChina/describe";

/**
 * The admin's half of one Pay to China request.
 *
 * WHAT THIS IS OPTIMISED FOR: somebody with two apps open, transcribing
 * details from this card into a Chinese payment app, on a phone, with real
 * money at stake. Every field that gets typed somewhere else has its own copy
 * button — one concatenated line would mean selecting part of a string by
 * hand, which is exactly how a digit gets lost.
 */

export function PayoutDetails({
  fields,
  qrRef,
}: {
  fields: PayoutField[];
  qrRef: string | null;
}) {
  return (
    <div className="space-y-1.5">
      {fields.map((field) => (
        <div key={field.label} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="shrink-0 text-muted-foreground">{field.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`break-all text-right text-foreground ${
                field.copyable ? "font-mono text-xs" : ""
              }`}
            >
              {field.value}
            </span>
            {field.copyable && <CopyButton value={field.value} label="Copy" />}
          </span>
        </div>
      ))}
      {qrRef && <AssetPreview bucket="pay-to-china-qr" path={qrRef} label="Recipient QR code" />}
    </div>
  );
}

/**
 * A private-bucket image, fetched through a short-lived signed URL only when
 * the admin actually looks.
 *
 * Lazy on purpose: a queue of thirty requests would otherwise mint thirty
 * signed URLs on every render, most of which nobody opens, and each one is a
 * live link to a customer's file for as long as it lasts.
 */
export function AssetPreview({
  bucket,
  path,
  label,
}: {
  bucket: "pay-to-china-qr" | "pay-to-china-proof";
  path: string;
  label: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (url) {
      setOpen(true);
      return;
    }
    setLoading(true);
    const result = await signPayToChinaAsset(bucket, path);
    setLoading(false);
    if (result.error || !result.url) {
      setError(result.error ?? "Could not open that file.");
      return;
    }
    setUrl(result.url);
    setOpen(true);
  }

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={load}
        className="min-h-11 text-sm font-medium text-primary"
      >
        {loading ? "Opening…" : `View ${label.toLowerCase()}`}
      </button>
      <FieldError>{error}</FieldError>
      <Lightbox open={open} src={url} alt={label} onClose={() => setOpen(false)} />
    </div>
  );
}

export function PayToChinaQueueActions({
  transactionId,
  status,
  targetCny,
  userId,
}: {
  transactionId: string;
  status: string;
  /** The CNY this request was priced at — prefilled, because it is right
   *  almost every time and retyping it is how a typo gets in. */
  targetCny: number | null;
  userId: string;
}) {
  const [startState, startAction] = useActionState(startPayToChina, {});
  const [completeState, completeAction] = useActionState(completePayToChina, {});
  const [rejectState, rejectAction] = useActionState(rejectPayToChina, {});

  const [requestedMode, setRequestedMode] = useState<"idle" | "completing" | "rejecting">("idle");
  const [proofRef, setProofRef] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // The open form closes because the CARD GOES AWAY: both actions
  // revalidate the queue, and a completed or rejected request leaves the
  // pending filter it was being worked in. Closing it from an effect as well
  // would be a synchronous state write on every action result, and would
  // then need its own guard against reopening.
  const mode = completeState.ok || rejectState.ok ? "idle" : requestedMode;

  /**
   * The proof upload goes browser -> bucket directly, through a signed URL
   * the server mints. The bytes never pass through a server action: a
   * screenshot from a phone routinely exceeds the action body limit, which
   * rejects the request BEFORE the action runs and so cannot be caught by
   * any error handling inside it.
   */
  async function uploadProof(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const prepared = await createPayToChinaProofUploadUrl(transactionId);
      if (prepared.error || !prepared.token || !prepared.path) {
        setUploadError(prepared.error ?? "Could not prepare the upload.");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("pay-to-china-proof")
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: file.type || "image/jpeg",
        });
      if (error) {
        setUploadError("That upload didn't go through. Please try again.");
        return;
      }
      setProofRef(prepared.path);
    } finally {
      setUploading(false);
    }
  }

  if (mode === "rejecting") {
    return (
      <form action={rejectAction} className="space-y-2">
        <input type="hidden" name="transactionId" value={transactionId} />
        <TextAreaField
          name="reason"
          label="Why are you rejecting this?"
          hint="The customer sees this, and their money goes back automatically"
          required
          placeholder="e.g. The Alipay account couldn't be found with those details."
          defaultValue={rejectState.values?.reason ?? ""}
        />
        <div className="flex gap-2">
          <SubmitButton variant="danger" size="sm" fullWidth={false} pendingLabel="Rejecting…">
            Reject and refund
          </SubmitButton>
          <button
            type="button"
            onClick={() => setRequestedMode("idle")}
            className="min-h-11 px-3 text-sm font-medium text-muted-foreground"
          >
            Cancel
          </button>
        </div>
        <FieldError>{rejectState.error}</FieldError>
      </form>
    );
  }

  if (mode === "completing") {
    return (
      <form action={completeAction} className="space-y-2">
        <input type="hidden" name="transactionId" value={transactionId} />
        <input type="hidden" name="userId" value={userId} />
        {proofRef && <input type="hidden" name="proofRef" value={proofRef} />}

        <TextField
          name="actualCny"
          label="CNY actually delivered"
          inputMode="decimal"
          required
          // Prefilled with the quoted figure: it is right almost every time,
          // and the cases where it is not are exactly the ones worth typing.
          defaultValue={targetCny != null ? targetCny.toFixed(2) : ""}
          hint="Change it only if the recipient got a different amount"
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Payment receipt
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadProof(file);
            }}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-border file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {uploading
              ? "Uploading…"
              : proofRef
                ? "Uploaded. The customer will see it on their receipt."
                : "A screenshot of the payment landing. The customer sees this."}
          </p>
          <FieldError>{uploadError}</FieldError>
        </div>

        <div className="flex gap-2">
          <SubmitButton size="sm" fullWidth={false} pendingLabel="Completing…">
            Mark paid
          </SubmitButton>
          <button
            type="button"
            onClick={() => setRequestedMode("idle")}
            className="min-h-11 px-3 text-sm font-medium text-muted-foreground"
          >
            Cancel
          </button>
        </div>
        <FieldError>{completeState.error}</FieldError>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "pending" && (
        <form action={startAction}>
          <input type="hidden" name="transactionId" value={transactionId} />
          <SubmitButton variant="secondary" size="sm" fullWidth={false} pendingLabel="Starting…">
            Mark processing
          </SubmitButton>
        </form>
      )}

      <button
        type="button"
        onClick={() => setRequestedMode("completing")}
        className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
      >
        Mark paid
      </button>

      <button
        type="button"
        onClick={() => setRequestedMode("rejecting")}
        className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-destructive"
      >
        Reject
      </button>

      <FieldError>{startState.error}</FieldError>
    </div>
  );
}
