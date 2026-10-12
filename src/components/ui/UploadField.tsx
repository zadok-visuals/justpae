"use client";

import { useId, useState } from "react";
import { Label, FieldError } from "@/components/ui/Field";
import { uploadToStorage } from "@/lib/storage/clientUpload";

/**
 * A file field that uploads IMMEDIATELY on selection, straight to private
 * storage, and submits only the resulting path as a hidden input.
 *
 * This replaces FileField for KYC. The difference is not cosmetic: FileField
 * leaves the File in the form, so the bytes travel inside the server action's
 * body and a phone photo exceeds the body limit before the action ever runs —
 * the production crash described in src/lib/storage/clientUpload.ts. Here the
 * form only ever carries a short string.
 *
 * The upload-on-selection shape also buys a better flow than the old one: the
 * user learns a file is too large, or that the upload failed, at the moment
 * they pick it rather than after filling in everything else and pressing
 * submit.
 *
 * NOTE ON `required`: it is NOT set on the hidden input. A hidden input is
 * barred from constraint validation by spec, so `required` there is silently
 * inert — it would look like a gate and be nothing of the kind. Readiness is
 * reported upward via onUploadedChange and the parent disables submit, which is
 * also the correct behaviour: submit must wait for the upload to SUCCEED, not
 * merely for a file to have been picked.
 */
export function UploadField({
  name,
  label,
  hint,
  accept,
  capture,
  bucket,
  userId,
  prefix,
  onUploadedChange,
  className = "",
}: {
  name: string;
  label: string;
  hint?: string;
  accept?: string;
  capture?: "user" | "environment";
  bucket: string;
  userId: string;
  /** Names the document in the storage path, e.g. "selfie". */
  prefix: string;
  /** Fires with the storage path on success, and with null while pending or
   *  after a failure. */
  onUploadedChange?: (path: string | null) => void;
  className?: string;
}) {
  const id = useId();

  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setStatus("uploading");
    // Cleared first, so a failed replacement can never leave the previous
    // file's path attached to a document the user has visibly swapped out.
    setPath("");
    onUploadedChange?.(null);

    try {
      const uploaded = await uploadToStorage({ bucket, userId, prefix, file });
      setPath(uploaded);
      setStatus("done");
      onUploadedChange?.(uploaded);
    } catch (err) {
      // uploadToStorage only ever throws already-user-safe messages.
      setError(err instanceof Error ? err.message : "That upload didn't work.");
      setStatus("error");
      onUploadedChange?.(null);
    }
  }

  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>

      <label
        htmlFor={id}
        className="jp-field flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input bg-secondary px-4 py-4 text-center"
      >
        <span className="text-sm font-medium text-foreground">
          {status === "uploading"
            ? "Uploading…"
            : status === "done"
              ? (fileName ?? "Uploaded")
              : status === "error"
                ? "Tap to try another file"
                : "Tap to choose a file"}
        </span>
        <span className="text-xs text-muted-foreground">
          {status === "done"
            ? "Uploaded — tap to replace"
            : status === "uploading"
              ? "Hold on…"
              : "JPG, PNG, HEIC or PDF · up to 8MB"}
        </span>
        <input
          id={id}
          type="file"
          accept={accept}
          capture={capture}
          onChange={handleChange}
          className="sr-only"
        />
      </label>

      {/* The only thing that reaches the server action. */}
      <input type="hidden" name={name} value={path} />

      <FieldError>{error}</FieldError>
    </div>
  );
}
