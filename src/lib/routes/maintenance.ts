// Relative, with extensions: this module is covered by maintenance.test.ts,
// which runs under `node --test` with no bundler and therefore no "@/" alias
// resolution. services.ts and flags.ts are both reachable that way.
import { isServiceLive } from "../services.ts";

/**
 * GROUP 2c. Where a locked page sends a request, or null to let it through.
 *
 * Read by src/proxy.ts on every matched request — not just by each page's
 * own component — so a direct URL, a bookmark or a prefetch cannot open a
 * page whose service flag is off, the same way isProtectedPath() in
 * ./access.ts stops a signed-out request before any component runs.
 *
 * Account pages redirect to /accounts rather than /home: the wallet is still
 * theirs, it is one level up that is now the honest answer to "where do I
 * see it", not the dashboard.
 */
export function maintenanceRedirect(pathname: string, searchParams: URLSearchParams): string | null {
  if (matches(pathname, "/bills") && !isServiceLive("bills")) return "/home";
  if (matches(pathname, "/flights") && !isServiceLive("flights")) return "/home";
  if (pathname === "/receive" && !isServiceLive("receiveUsd")) return "/home";

  if (pathname === "/accounts/USD" && !isServiceLive("usdWallet")) return "/accounts";
  if (pathname === "/accounts/GHS" && !isServiceLive("ghsWallet")) return "/accounts";

  // The three money forms, whichever currency they were asked to open with.
  // `to` is convert's target-side param (?to=CNY and friends) — the source
  // side uses `currency`, same as deposit and withdraw.
  if (matches(pathname, "/deposit") || matches(pathname, "/convert") || matches(pathname, "/withdraw")) {
    for (const param of ["currency", "to"]) {
      const value = searchParams.get(param);
      if (value === "USD" && !isServiceLive("usdWallet")) return "/home";
      if (value === "GHS" && !isServiceLive("ghsWallet")) return "/home";
    }
  }

  return null;
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
