import path from "path";
import type { NextConfig } from "next";
import { assertE2eProviderMocksAreSafe } from "./src/lib/e2e/guard";

/**
 * Runs at module scope, which means it runs during `next build`. A build that
 * sets E2E_MOCK_PROVIDERS in a hosted environment therefore FAILS rather than
 * producing a deployable artefact with fake payment providers inside it.
 *
 * It is the first statement in the file on purpose: nothing else about the
 * config should be allowed to succeed first and make the failure look like a
 * different problem.
 */
assertE2eProviderMocksAreSafe();

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  devIndicators: false,
  images: {
    /**
     * AVIF first — browsers that support it get ~50 % smaller files than WebP
     * for the same visual quality, which matters a lot for 3D illustrations
     * with fine detail and alpha. WebP is the fallback for everything else.
     * PNG/JPEG are never sent to the client.
     */
    formats: ["image/avif", "image/webp"],
    /**
     * Real phone widths + a desktop step. Fewer sizes → fewer cache variants →
     * faster first-hit optimisation. The default list has 16 entries; this one
     * has 6, which still covers every device in the product's target market.
     */
    deviceSizes: [390, 430, 768, 1024, 1280, 1920],
    imageSizes: [48, 96, 160, 256, 480],
    /** Sharper than the default 75 for 3D art; still well inside safe file size. */
    quality: 85,
  },
  experimental: {
    /**
     * A SAFETY NET, not a feature. Files no longer travel through server
     * actions at all — KYC uploads go straight from the browser to private
     * storage and the action receives only a path string (see
     * src/lib/storage/clientUpload.ts for the production crash that caused).
     *
     * This is raised from the 1MB default purely so that an action which
     * accidentally grows a large text payload fails loudly in its own
     * try/catch rather than being rejected before it runs — the failure mode
     * that made the upload bug so hard to see. It is deliberately NOT large
     * enough to carry a phone photo: doing that would invite the old pattern
     * back, and the platform's own function body limit sits above it anyway.
     */
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

/**
 * The origin the browser is allowed to talk to Supabase on.
 *
 * Read from the same variable the clients are built from, so a project move
 * cannot leave the CSP pointing at the old project and silently break every
 * request. Falls back to allowing any *.supabase.co only when the variable is
 * absent — which is a misconfigured build, and a CSP that bricks the app is a
 * worse way to find that out than the env check in requireEnv already is.
 */
function supabaseOrigins(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "https://*.supabase.co wss://*.supabase.co";
  try {
    const { origin, host } = new URL(url);
    // wss for Realtime. Not used today, and listing it costs nothing next to
    // debugging a websocket that fails with no error anyone can see.
    return `${origin} wss://${host}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
}

function securityHeaders() {
  const supabase = supabaseOrigins();
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",

    // WHY 'unsafe-inline' IS HERE, stated rather than buried: Next's App
    // Router inlines its own bootstrap script and streams the RSC payload in
    // inline <script> tags. Allowing those without 'unsafe-inline' needs a
    // per-request nonce generated in the proxy and threaded onto the request
    // headers — which this app's proxy cannot do without restructuring the
    // Supabase cookie handler that rebuilds the response object on every
    // set. That is a real tightening and it is recorded as a decision rather
    // than half-done here. What this CSP DOES still buy, today: no script may
    // be LOADED from another origin, which is how injected script is normally
    // delivered.
    //
    // 'unsafe-eval' in development only — React Refresh needs it, and it must
    // not be in a production header.
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",

    // next/font self-hosts the font files at build time, so no Google Fonts
    // origin is needed at runtime. 'unsafe-inline' covers Tailwind's own
    // inlined styles and React's style attributes.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",

    // data: for the QR codes (generated as data URLs by `qrcode`), blob: for
    // the local preview of a document the user has just chosen but not yet
    // uploaded, and the Supabase origin for signed URLs out of private
    // storage.
    `img-src 'self' data: blob: ${supabase}`,

    // Supabase for auth, data and storage. Resend is called server-side only
    // and deliberately absent — if it ever appears here, an API key has moved
    // into the browser.
    `connect-src 'self' ${supabase}`,

    // No plugins, no embedded documents, and nothing may frame this app. The
    // app is a money product; being embeddable is how a clickjacked transfer
    // happens.
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",

    // Stops an injected <base> from re-pointing every relative URL, and
    // restricts where a form may post — including the server actions, which
    // are same-origin posts.
    "base-uri 'self'",
    "form-action 'self'",

    // No http subresources in production.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },

    // Strict-Transport-Security is set in src/proxy.ts, not here — see the
    // comment there on why a static header in this file cannot be the e2e
    // harness's own loopback server safely: next.config.ts's headers() is
    // baked into the build's routes manifest at `next build` time, before the
    // harness's `next start`-only E2E_MOCK_PROVIDERS flag is even set.

    // Stops a browser from deciding a stored document is HTML and running it.
    // It matters here specifically: this app serves user-uploaded files back
    // through signed storage URLs.
    { key: "X-Content-Type-Options", value: "nosniff" },

    // Same origin gets the full path; anyone else gets the origin only. A
    // referrer carrying /transactions?type=withdrawal into a third party says
    // more about the user than it needs to.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

    // Camera stays allowed on our own origin — the KYC upload fields use
    // capture= to photograph a document. Everything else is off.
    {
      key: "Permissions-Policy",
      value: [
        "camera=(self)",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "magnetometer=()",
        "accelerometer=()",
        "gyroscope=()",
        "display-capture=()",
      ].join(", "),
    },

    // Redundant with frame-ancestors for current browsers, kept for the ones
    // that only understand this.
    { key: "X-Frame-Options", value: "DENY" },

    // Keeps this origin out of a shared browsing-context group, so a window
    // it opens (or that opens it) cannot reach into it.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

export default nextConfig;
