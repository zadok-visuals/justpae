import { createClient } from "@/lib/supabase/client";

/**
 * Browser-only. Uploads a user-selected file straight from the browser into the
 * private storage bucket, so the file bytes never go through a server action.
 *
 * WHY THIS EXISTS — a real production crash, not a theoretical limit.
 *
 * KYC selfies and ID photos were posted inside a server action's own FormData.
 * A phone photo is routinely 3-8MB, and Next's default server-action body limit
 * is 1MB (with the hosting platform's own function body limit around 4.5MB
 * above that). The request was therefore REJECTED BEFORE THE ACTION RAN — so
 * every try/catch inside submitIndividualKyc was irrelevant, the careful error
 * messages never fired, and with no error boundary in the tree the user just
 * saw the framework's generic "something went wrong" page. The one thing they
 * had to do to use the product at all failed, with no explanation, on any
 * modern phone camera.
 *
 * Uploading direct to storage sidesteps the limit entirely: only a short path
 * string ever travels through the action. No new storage policy is needed —
 * migration 0001's "kyc-documents: upload own folder" already permits a user to
 * write into their own `${userId}/…` folder, which is exactly what this does.
 *
 * The path that comes back is then untrusted client input like anything else,
 * and is re-verified server-side before being written to a row a reviewer will
 * open. See verifyUpload.ts.
 */

/**
 * Hard ceiling AFTER compression. Images are downsized first, so in practice
 * only a PDF gets near this.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

/**
 * The provider's raw error text is never shown. It is provider internals, it
 * means nothing to the person holding the phone, and it can leak detail about
 * bucket layout — the same "log the real thing, show one clean line" rule
 * toCustomerError applies on the server.
 */
const FRIENDLY_UPLOAD_ERROR =
  "We couldn't upload that file. Please try a smaller photo, or try again in a moment.";

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Extension derived from the file's own MIME type, NEVER from the user-supplied
 * filename — a filename is attacker-controlled text that ends up in a storage
 * path. Falls back to a short alphanumeric suffix of the original name only
 * when the MIME type is unrecognised, and to "bin" if even that fails.
 */
function sanitizedExtension(file: File): string {
  switch (file.type.toLowerCase()) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/heic":
    case "image/heif":
      return "heic";
    default: {
      const match = /\.([a-zA-Z0-9]{1,5})$/.exec(file.name);
      return match ? match[1].toLowerCase() : "bin";
    }
  }
}

/**
 * Downsizes to at most 1600px on the longest side and re-encodes as JPEG via a
 * canvas — no image library needed. A full-resolution phone photo is easily
 * 8-12MB; this lands it in the low hundreds of KB, which matters most on the
 * mobile connections this product is actually used on.
 *
 * Falls back to the original file untouched if the browser can't decode it (an
 * exotic format `createImageBitmap` doesn't handle, HEIC on some browsers) or
 * if there is no 2D context. A failed compression attempt must never be the
 * reason an upload is refused — it is an optimisation, not a gate.
 */
async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    return new File([blob], file.name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export interface UploadToStorageOptions {
  bucket: string;
  userId: string;
  /** Names the document, e.g. "selfie" or "id-document". */
  prefix: string;
  file: File;
}

/**
 * Returns the storage path, always
 * `${userId}/${prefix}-${timestamp}-${randomId}.${ext}` — never the original
 * filename. Throws an Error whose message is already safe to show the user.
 *
 * The user id is the FIRST path segment on purpose: the storage policies match
 * on `storage.foldername(name)[1]`, so that segment is what confines a user to
 * their own folder.
 */
export async function uploadToStorage({
  bucket,
  userId,
  prefix,
  file,
}: UploadToStorageOptions): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  // An empty file.type happens on some Android pickers; allow it through to the
  // size and upload checks rather than rejecting a legitimate photo outright.
  if (file.type && !isImage && !isPdf) {
    throw new Error("Please choose a photo or a PDF.");
  }

  const uploadFile = isImage ? await compressImage(file) : file;

  if (uploadFile.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is too large. Please choose one under 8MB.");
  }

  const path = `${userId}/${prefix}-${Date.now()}-${randomId()}.${sanitizedExtension(uploadFile)}`;

  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, uploadFile, {
    contentType: uploadFile.type || undefined,
    upsert: true,
  });

  if (error) {
    console.error("[uploadToStorage] failed", { bucket, prefix, message: error.message });
    throw new Error(FRIENDLY_UPLOAD_ERROR);
  }

  return path;
}
