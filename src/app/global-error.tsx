"use client";

import { useEffect } from "react";

/**
 * The last resort: this catches errors thrown by the ROOT layout itself, which
 * error.tsx sits inside and therefore cannot catch.
 *
 * EVERYTHING HERE IS INLINE-STYLED ON PURPOSE. global-error.tsx replaces the
 * root layout entirely — it renders its own <html> and <body> — so globals.css
 * and the font links from that layout are not guaranteed to be present. A
 * Tailwind class or a `var(--color-primary)` here would silently render as
 * nothing on exactly the screen that must not be broken. The justpae palette
 * is therefore written out as literals: ink #0b0d10, blue #5b7cff, mark gold
 * #f7b928, paper #f3f5f7.
 *
 * This is also why it is deliberately plain. It has one job — say the service
 * is still there, and offer one button.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error.digest, error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 16px",
          backgroundColor: "#0b0d10",
          color: "#f3f5f7",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          {/* The mark, inlined rather than imported: a component import would
              pull in the token-based version whose CSS variables are not
              guaranteed to exist here. */}
          <svg
            width="40"
            height="40"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
            style={{ marginBottom: 20 }}
          >
            <rect width="32" height="32" rx="9" fill="#15181c" />
            <path
              d="M20 8.5v10.25c0 2.9-2.3 5.25-5.15 5.25-2.2 0-4.1-1.4-4.85-3.4"
              stroke="#f7b928"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path d="M14.5 13.25h9" stroke="#32d583" strokeWidth="2.2" strokeLinecap="round" />
          </svg>

          <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600 }}>
            justpae is having a moment
          </h1>
          <p style={{ margin: "0 0 24px", fontSize: 14, lineHeight: 1.6, color: "#9aa0a8" }}>
            Something went wrong loading the app. Your money and your balances are untouched.
          </p>

          <button
            onClick={() => unstable_retry()}
            style={{
              display: "inline-block",
              padding: "12px 28px",
              fontSize: 15,
              fontWeight: 600,
              color: "#0b0d10",
              backgroundColor: "#5b7cff",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          <p style={{ margin: "24px 0 0", fontSize: 12, color: "#7d848d" }}>
            Still stuck?{" "}
            <a href="mailto:support@justpae.com" style={{ color: "#5b7cff" }}>
              support@justpae.com
            </a>
            {error.digest && (
              <>
                <br />
                <span style={{ fontFamily: "monospace" }}>Reference {error.digest}</span>
              </>
            )}
          </p>
        </div>
      </body>
    </html>
  );
}
