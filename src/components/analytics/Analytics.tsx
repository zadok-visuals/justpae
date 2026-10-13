import Script from "next/script";
import { analyticsMeasurementId } from "@/lib/site";

/**
 * Google Analytics, on the public pages only.
 *
 * TWO RULES, both deliberate:
 *
 * 1. OFF UNLESS CONFIGURED. No measurement ID in the environment means no
 *    script tag at all — not a disabled one, not a placeholder property. An
 *    analytics tag that ships enabled by default is a tracker nobody decided
 *    to add.
 *
 * 2. PUBLIC PAGES ONLY. This is rendered by the landing page and the two legal
 *    pages, never by the dashboard layout. Behind sign-in, a URL is not
 *    anonymous: /transactions?type=withdrawal next to a session is a statement
 *    about a specific identified person's money, and sending it to an
 *    advertising company is not something a payments product should do
 *    quietly. Measuring whether the landing page converts does not require it.
 *
 * It needs a CSP entry before it will load — see securityHeaders() in
 * next.config.ts, whose script-src is 'self' only. That is intentional: turning
 * analytics on is two deliberate changes, not one forgotten env var.
 */
export function Analytics() {
  const measurementId = analyticsMeasurementId();
  if (!measurementId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            anonymize_ip: true,
            allow_google_signals: false,
            allow_ad_personalization_signals: false
          });
        `}
      </Script>
    </>
  );
}
