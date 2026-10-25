/**
 * What a browser will actually paint in an <img>, and what it won't.
 *
 * HEIC is the case that matters: it is what an iPhone hands over from the
 * photo library, Safari renders it, and nothing else does. We re-encode to
 * JPEG whenever the browser can decode the file at all (see compressImage),
 * so a HEIC that survives as image/heic is one that could not be decoded —
 * and showing it in an <img> produces a broken-image icon next to a document
 * the user is being asked to confirm.
 */

const RENDERABLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

export function isRenderableImageType(type: string | undefined | null): boolean {
  return RENDERABLE_IMAGE_TYPES.has((type ?? "").toLowerCase());
}

/**
 * Some Android and iOS pickers hand over a File with an empty `type`. The
 * extension is the only remaining signal, and it is only ever used to decide
 * whether to ATTEMPT a conversion — never to trust the contents.
 */
export function looksLikeImage(name: string, type: string | undefined | null): boolean {
  if ((type ?? "").toLowerCase().startsWith("image/")) return true;
  if (type) return false;
  return /\.(jpe?g|png|webp|gif|bmp|hei[cf])$/i.test(name);
}
