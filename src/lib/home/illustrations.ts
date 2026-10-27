import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Does this illustration actually exist?
 *
 * Images are served from public/ root — e.g. public/Deposit.png is available
 * at /Deposit.png. The check therefore looks in the public/ root, not a
 * subdirectory.
 *
 * In production the result is cached for the life of the process (a handful
 * of syscalls; the answer doesn't change while the server runs).
 * In development the cache is skipped so replacing a file on disk is
 * reflected immediately without a server restart.
 */
const DIRECTORY = path.join(process.cwd(), "public");

const cache = new Map<string, boolean>();
const isDev = process.env.NODE_ENV === "development";

export function illustrationExists(file: string): boolean {
  if (!isDev) {
    const cached = cache.get(file);
    if (cached !== undefined) return cached;
  }

  let found = false;
  try {
    found = existsSync(path.join(DIRECTORY, file));
  } catch {
    found = false;
  }

  if (!isDev) cache.set(file, found);
  return found;
}
