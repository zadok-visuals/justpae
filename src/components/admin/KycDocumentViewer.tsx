"use client";

import { useState, useTransition } from "react";
import { Lightbox } from "@/components/ui/Lightbox";
import { signKycDocument } from "@/lib/actions/admin";

/**
 * "View" on a KYC document row.
 *
 * The queue used to print the bucket path and stop there, so the person
 * deciding whether to reject an account could not see the document the
 * decision was about. This signs a URL on demand and opens it.
 *
 * Images go in the Lightbox — same Modal primitive as every other dialog, so
 * Escape and the focus trap behave the way they do everywhere else. A PDF
 * cannot render in an <img>, so that opens in a new tab instead of showing a
 * broken image icon and calling it a viewer.
 */
export function KycDocumentViewer({
  userId,
  path,
  label,
}: {
  userId: string;
  path: string;
  label: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startOpening] = useTransition();

  // By extension, because the signed URL carries a query string and the stored
  // path is the only reliable thing to read a type off.
  const isPdf = /\.pdf$/i.test(path);

  function open() {
    setError(null);
    startOpening(async () => {
      const result = await signKycDocument(userId, path);
      if (result.error || !result.url) {
        setError(result.error ?? "Couldn't open that document.");
        return;
      }
      if (isPdf) {
        // noopener: a signed URL to someone's identity document should not hand
        // the opened tab a handle back to this one.
        window.open(result.url, "_blank", "noopener,noreferrer");
        return;
      }
      setUrl(result.url);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className="min-h-11 text-sm font-medium text-primary disabled:opacity-50"
      >
        {pending ? "Opening…" : isPdf ? "Open PDF" : "View"}
      </button>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <Lightbox open={url !== null} src={url} alt={label} onClose={() => setUrl(null)} />
    </>
  );
}
