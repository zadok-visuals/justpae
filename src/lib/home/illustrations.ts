import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Does this illustration actually exist?
 *
 * The artwork ships separately from the code, so at any moment some of
 * public/illustrations may be empty — and Home has to look finished either
 * way. The brief's rule is "show a 48px icon instead, so the layout never
 * breaks", and the question of WHICH to draw is answered here, on the
 * server, before a byte of HTML is sent.
 *
 * WHY NOT `onError` ON THE CLIENT, which is the obvious answer. The <img> is
 * server-rendered, so its request fails during the initial parse — before
 * React has hydrated and attached any handler. The error event has already
 * been and gone by the time an onError prop exists, and the user is left
 * looking at the browser's broken-image glyph. A client fallback is still
 * wired up as a safety net (see TileArt), but it cannot be the mechanism.
 *
 * CACHED FOR THE LIFE OF THE PROCESS. This is a handful of syscalls and the
 * answer does not change while a server is running; the trade is that adding
 * a file needs a restart to be picked up, which is true of everything else in
 * public/ anyway.
 *
 * A FAILED CHECK MEANS "MISSING". If the filesystem cannot be read at all,
 * the icon renders — which is a complete-looking tile — rather than an <img>
 * that may well 404 into a torn layout.
 */
const DIRECTORY = path.join(process.cwd(), "public", "illustrations");

const cache = new Map<string, boolean>();

export function illustrationExists(file: string): boolean {
  const cached = cache.get(file);
  if (cached !== undefined) return cached;

  let found = false;
  try {
    found = existsSync(path.join(DIRECTORY, file));
  } catch {
    found = false;
  }

  cache.set(file, found);
  return found;
}
