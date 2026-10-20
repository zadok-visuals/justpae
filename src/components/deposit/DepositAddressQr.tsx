"use client";

import { useEffect, useState } from "react";

/**
 * GROUP 4h — the USDT deposit address as a QR code.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AT ALL
 *
 * A BSC address is 42 characters of hexadecimal. The screen it appears on is
 * the one where sending it to the wrong place loses the money permanently —
 * there is no recall on a chain transfer and no provider to ring. Up to now
 * the only way to get the address into a wallet app was to copy it on the
 * phone and paste it in the other app, which works, and the moment it does
 * not work is the moment somebody reads it off the screen by eye instead.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GENERATED LOCALLY. NOT FROM AN IMAGE SERVICE.
 *
 * The obvious shortcut is `https://api.qrserver.com/...?data=<address>` or
 * Google's chart API. Both are forbidden here and the reason is not
 * aesthetic:
 *
 *   1. It hands a third party a deposit address belonging to an identified
 *      customer, on every render, in a URL that lands in their access logs.
 *   2. The rendered QR is then whatever that host returns. A compromised or
 *      hijacked image endpoint can encode a DIFFERENT address, and the page
 *      would display it with no way for anyone to notice — the code is not
 *      human-readable, which is exactly why it is dangerous to outsource.
 *   3. next.config.ts's CSP is `'self'`, so an external image is blocked with
 *      no visible error and the screen silently loses its QR.
 *
 * `qrcode` was already a dependency. The encoding happens in this component,
 * in the browser, from the same string the copy button copies — so the code
 * and the text cannot disagree.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DARK MODULES ON A WHITE TILE, IN A DARK-THEMED APP
 *
 * This is the mistake worth naming. justpae is dark ink and gold, so the
 * instinct is to generate the QR to match — light modules on the dark
 * background, no white box interrupting the design. Do not. Camera-based
 * scanners overwhelmingly expect dark-on-light, and an inverted code is read
 * unreliably or not at all by most phone wallet apps. "Unreliably" is the bad
 * outcome, not the good one: it works for the person who tests it and fails
 * for a customer standing in bad light trying to send money.
 *
 * So the colours are hard-coded rather than taken from CSS variables, the
 * tile is white in both themes, and `margin: 2` keeps the quiet zone the
 * spec requires — a QR butted against a coloured edge loses its finder
 * pattern.
 *
 * SIZE. 512px of encoded PNG rendered into a 15rem (240px) box, so it is
 * crisp on a 3× phone screen and still a comfortable scanning target in the
 * hand — around 60% of a 375px viewport's width. `errorCorrectionLevel: "M"`
 * is the default-ish middle: enough redundancy to survive a thumb smudge or
 * a glare spot without inflating the module count of a 42-character payload
 * into something dense.
 *
 * NO ASYNC WORK ON THE SERVER, and no flash of a broken image: the data URL
 * is produced in an effect, and until it is there the tile holds its own
 * space with a pulse. A QR that pops in and reflows the page under somebody's
 * thumb while they are aiming a camera is worse than one that arrives a tick
 * later in a box that was already the right size.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GROUP 11c — THE LIBRARY IS IMPORTED WHEN A CODE IS ENCODED, NOT BEFORE
 *
 * `import QRCode from "qrcode"` at the top of this file put the whole encoder
 * — a 96 kB chunk in the production build, measured, which is the largest
 * single third-party thing in this app's client bundle — into /deposit's
 * payload for EVERY deposit.
 *
 * Most deposits never show a QR. Naira and shilling deposits are bank
 * transfers: the screen renders an account number and a reference, and this
 * component is not mounted at all. The one currency that does need it is
 * USDT. So the common case was downloading an encoder it would never call,
 * on the screen where somebody is waiting to be told where to send money.
 *
 * The import moved into the effect, which is the right place rather than
 * merely a later one: the component already renders its white tile at full
 * size before the data URL exists, so the extra round trip for the chunk
 * lands inside a wait that was already there and shows the same pulse. There
 * is no new loading state and nothing moves on screen.
 *
 * next/dynamic on this component would have been the weaker fix. The
 * component is small; the library is the weight, and dynamic() on the wrapper
 * still bundles whatever the wrapper statically imports into the lazy chunk
 * while adding a second loading state to a screen that did not need one.
 */

/** Hard-coded, NOT theme variables. See the note above — this is the bug. */
const QR_DARK = "#0b0b0c";
const QR_LIGHT = "#ffffff";

/**
 * The provider reports the chain as "BSC". Customers know it by the token
 * standard at least as often, and a user looking at a wallet app's network
 * dropdown is choosing between entries labelled "BEP20". Printing both is
 * what makes the two vocabularies line up; printing one is how USDT goes out
 * on Ethereum.
 */
export function networkLabel(network: string): string {
  const trimmed = network.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "BSC") return "BSC (BEP20)";
  return trimmed;
}

export function DepositAddressQr({
  address,
  network,
  currency,
}: {
  address: string;
  network: string;
  currency: string;
}) {
  /**
   * ONE piece of state carrying the address it belongs to, rather than a
   * `dataUrl` and a `failed` flag reset at the top of the effect.
   *
   * The reset is the reason. `setDataUrl(null)` in the effect BODY is a
   * synchronous setState inside an effect — a cascading render, and a lint
   * error under react-hooks/set-state-in-effect. Stamping the address into
   * the state instead makes staleness something the render DERIVES
   * (`encoded.address !== address`) rather than something an effect has to
   * go and clear, so every setState here happens in a promise callback.
   *
   * It also fixes a real bug the two-flag version had: between a prop change
   * and the new code resolving, the component would have gone on showing the
   * PREVIOUS address's QR. On this screen that is the worst possible stale
   * value to render.
   */
  const [encoded, setEncoded] = useState<{
    address: string;
    dataUrl: string | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;

    // GROUP 11c — see the note above. The dynamic import is inside the same
    // promise chain as the encode, so a chunk that fails to load is handled by
    // the same catch as an encode that fails: the QR is dropped, the address
    // and its copy button stay, and nothing throws on a screen holding live
    // transfer details.
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(address, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 512,
          color: { dark: QR_DARK, light: QR_LIGHT },
        }),
      )
      .then((url) => {
        if (active) setEncoded({ address, dataUrl: url, failed: false });
      })
      .catch((err) => {
        // Never fatal. The address itself is on screen with its copy button
        // directly below, so a failed encode costs convenience and nothing
        // else — and a thrown error on a screen holding live transfer details
        // would cost considerably more.
        console.error("[DepositAddressQr] encode failed", err);
        if (active) setEncoded({ address, dataUrl: null, failed: true });
      });

    return () => {
      active = false;
    };
  }, [address]);

  const current = encoded?.address === address ? encoded : null;
  const dataUrl = current?.dataUrl ?? null;

  if (current?.failed) return null;

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">Scan with your wallet app</p>

      {/* The white tile. Present before the image resolves, at the same size,
          so nothing moves once it does. */}
      <div
        className="flex size-60 items-center justify-center overflow-hidden rounded-lg bg-white p-2"
        style={{ backgroundColor: QR_LIGHT }}
      >
        {dataUrl ? (
          // next/image is wrong for this one, not merely unnecessary. Its
          // loader optimises images it can fetch by URL; this is a data: URI
          // generated in the browser a tick ago, there is no network request
          // to optimise, and routing it through /_next/image would upload the
          // deposit address to the server as a query string for no benefit.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            // The address is NOT the alt text. It is 42 characters of hex that
            // a screen reader would spell out letter by letter, and it is
            // already available as real, selectable, copyable text below.
            alt={`QR code for your ${currency} deposit address`}
            width={512}
            height={512}
            className="size-full"
          />
        ) : (
          <span className="size-full animate-pulse rounded bg-black/10" aria-hidden="true" />
        )}
      </div>

      {/* The network, under the code, because this is the field people get
          wrong and the QR encodes the address alone — a chain is not part of
          an EVM address, so scanning cannot select the network for them. */}
      <p className="text-center text-xs text-muted-foreground">
        Network <span className="font-medium text-foreground">{networkLabel(network)}</span>
      </p>
    </div>
  );
}
