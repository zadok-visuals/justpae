"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { CopyButton } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";

/**
 * The shareable link and its QR code.
 *
 * The QR is rendered in the browser rather than server-side so the page
 * doesn't ship an image for data it already has as a string, and so it
 * re-renders at the right size on a high-DPI screen without a second asset.
 *
 * navigator.share is used where it exists — on a phone that opens the real
 * share sheet, which is what someone sending their details to a sender
 * actually wants. Everywhere else it falls back to copying.
 */
export function ShareLink({ url, referenceCode }: { url: string; referenceCode: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 480,
      margin: 1,
      // Light modules on a dark ground, matching the surface it sits on. A
      // white QR block on a near-black card is the single brightest thing on
      // the screen.
      color: { dark: "#f0e7dcff", light: "#15181cff" },
    })
      .then(setDataUrl)
      .catch((err) => {
        // A failed QR must not blank the page — the link and the copy button
        // are the functional parts; the QR is the convenience.
        console.error("[ShareLink] QR generation failed", err);
      });
  }, [url]);

  /**
   * The button is always rendered and the capability is checked at CLICK time,
   * not at render time.
   *
   * Checking during render needs `navigator`, which does not exist on the
   * server, so the server and client would disagree and the button would flash
   * in after hydration. Checking in an effect and storing the answer in state
   * writes state synchronously inside the effect body, which cascades a render
   * on every mount. Deciding when the user actually taps avoids both and is
   * also more honest: on a device with no share sheet, copying IS the share.
   */
  async function share() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "My justpae dollar details",
          text: `Send dollars to me on justpae. Reference: ${referenceCode}`,
          url,
        });
        return;
      } catch {
        // A cancelled share sheet throws, and a cancellation is not a failure
        // worth reporting. Falling through to the copy is still useful if the
        // sheet itself was unavailable rather than dismissed.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link to copy it by hand");
    }
  }

  return (
    <div className="space-y-3">
      {dataUrl && (
        <div className="flex justify-center">
          {/* Plain img, not next/image: this is a client-generated data URL,
              so there is nothing for the image optimiser to optimise. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt={`QR code for your receiving details, reference ${referenceCode}`}
            width={192}
            height={192}
            className="rounded-lg border border-border"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate rounded-lg border border-border bg-secondary px-3 py-2.5 font-mono text-xs text-muted-foreground">
          {url}
        </span>
        <CopyButton value={url} label="Copy link" />
      </div>

      <Button variant="secondary" fullWidth onClick={share}>
        Share my details
      </Button>
    </div>
  );
}
