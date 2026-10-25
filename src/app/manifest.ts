import type { MetadataRoute } from "next";

/**
 * The web app manifest, so "Add to Home Screen" produces an app rather than a
 * screenshot thumbnail with the page title under it.
 *
 * start_url is /home, not "/": a returning user tapping the icon wants their
 * balances, and "/" redirects a signed-in session there anyway — so pointing
 * at "/" just adds a redirect to every cold start.
 *
 * display: standalone. background_color is what fills the splash screen before
 * the first paint, so it is the app's own light ground; theme_color is the
 * brand blue the OS tints its chrome with.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "justpae",
    short_name: "justpae",
    description: "Hold, convert and send money across borders.",
    start_url: "/home",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2f54eb",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        // "any" rather than "maskable": the mark is drawn with its own rounded
        // ground and modest padding. Declaring it maskable would let Android
        // crop into that ground on a circular mask and clip the descender.
        purpose: "any",
      },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
