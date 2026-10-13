import type { MetadataRoute } from "next";

/**
 * The web app manifest, so "Add to Home Screen" produces an app rather than a
 * screenshot thumbnail with the page title under it.
 *
 * start_url is /home, not "/": a returning user tapping the icon wants their
 * balances, and "/" redirects a signed-in session there anyway — so pointing
 * at "/" just adds a redirect to every cold start.
 *
 * display: standalone, with the theme and background both set to the ink the
 * app actually paints. background_color is what fills the splash screen before
 * the first paint; left unset it is white, which means a white flash into a
 * dark app on every launch.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "justpae",
    short_name: "justpae",
    description: "Hold, convert and send money across borders.",
    start_url: "/home",
    display: "standalone",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
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
