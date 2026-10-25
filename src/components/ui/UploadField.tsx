"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Label, FieldError } from "@/components/ui/Field";
import { Lightbox } from "@/components/ui/Lightbox";
import { prepareUpload, uploadToStorage } from "@/lib/storage/clientUpload";

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
 * PREVIEW AND REMOVE both exist because this field's whole job is a photo of a
 * document, and the two questions anyone has about one are "did the right file
 * go up?" and "can I swap it?". A green tick next to a filename answers
 * neither. The preview is a local object URL — the file is already in the
 * browser, so showing it costs no network round trip and never needs a signed
 * URL for the private bucket.
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
  bucket: string;
  userId: string;
  /** Names the document in the storage path, e.g. "government-id". */
  prefix: string;
  /** Fires with the storage path on success, and with null while pending or
   *  after a failure. */
  onUploadedChange?: (path: string | null) => void;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  // An object URL is a document-lifetime reference to a blob. Not revoking it
  // leaks the whole file for as long as the page lives, and this field is used
  // several times per form.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function reset() {
    setStatus("idle");
    setFileName(null);
    setPath("");
    setError(null);
    setPreviewUrl(null);
    onUploadedChange?.(null);
    // The input's own value has to be cleared too, or re-picking the SAME file
    // fires no change event and the field silently stays empty.
    if (inputRef.current) inputRef.current.value = "";
  }

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
    setPreviewUrl(null);

    try {
      // Prepared first, so the preview shows the JPEG that will be uploaded
      // rather than the original — a HEIC from the iPhone photo library is
      // converted here, and only a file no browser could decode is left
      // without a preview.
      const { file: ready, previewable } = await prepareUpload(file);
      if (previewable) setPreviewUrl(URL.createObjectURL(ready));

      const uploaded = await uploadToStorage({ bucket, userId, prefix, file: ready, prepared: true });
      setPath(uploaded);
      setStatus("done");
      onUploadedChange?.(uploaded);
    } catch (err) {
      // uploadToStorage only ever throws already-user-safe messages, and it is
      // where the type and 8MB size checks live.
      setError(err instanceof Error ? err.message : "That upload didn't work.");
      setStatus("error");
      onUploadedChange?.(null);
    }
  }

  const uploaded = status === "done";

  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>

      <label
        htmlFor={id}
        className="jp-field flex min-h-24 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-secondary px-4 py-4"
      >
        {previewUrl ? (
          // A local blob: URL; there is nothing for next/image to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className={`size-14 shrink-0 rounded-md object-cover ${
              status === "uploading" ? "opacity-50" : ""
            }`}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground"
          >
            {status === "uploading" ? "…" : uploaded ? "✓" : "+"}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {status === "uploading"
              ? "Uploading…"
              : uploaded
                ? (fileName ?? "Uploaded")
                : status === "error"
                  ? "Tap to try another file"
                  : "Tap to choose a file"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {uploaded
              ? "Uploaded — tap to replace"
              : status === "uploading"
                ? "Hold on…"
                : "JPG, PNG, HEIC or PDF · up to 8MB"}
          </span>
        </span>

        <input
          id={id}
          ref={inputRef}
          type="file"
          accept={accept}
          // No `capture`: it forces the camera open and hides Photo Library
          // and Choose File, which is the wrong default for a document most
          // people already have a photo or a PDF of.
          onChange={handleChange}
          className="sr-only"
        />
      </label>

      {/* Buttons sit OUTSIDE the <label> — inside it, every click would also
          reopen the file picker. */}
      {uploaded && (
        <div className="mt-1.5 flex gap-4">
          {previewUrl && (
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="min-h-11 text-xs font-medium text-primary"
            >
              View full size
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            className="min-h-11 text-xs font-medium text-muted-foreground"
          >
            Remove
          </button>
        </div>
      )}

      {/* The only thing that reaches the server action. */}
      <input type="hidden" name={name} value={path} />

      <FieldError>{error}</FieldError>

      <Lightbox
        open={zoomed}
        src={previewUrl}
        alt={`${label} — full size`}
        onClose={() => setZoomed(false)}
      />
    </div>
  );
}
