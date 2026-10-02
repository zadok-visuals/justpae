import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * Three faces, each with a job:
 *   Fraunces      balances and headline amounts — the display voice
 *   Manrope       all UI text
 *   IBM Plex Mono references, wallet addresses, electricity tokens — anything
 *                 read character by character or compared digit by digit
 *
 * The CSS variables these expose are consumed by @theme in globals.css.
 */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope-face",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces-face",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "justpae",
    template: "%s · justpae",
  },
  description:
    "Hold dollars, naira, cedis, shillings and USDT in one place. Convert at live rates, withdraw to your bank or mobile money, and pay your bills.",
  applicationName: "justpae",
  appleWebApp: { capable: true, title: "justpae", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /**
   * viewport-fit=cover lets the page paint under the notch and home
   * indicator. WITHOUT IT every env(safe-area-inset-*) reads 0px, so the
   * bottom tab bar's safe-area padding silently does nothing.
   *
   * Zoom is deliberately NOT disabled. The reason people reach for
   * user-scalable=no is iOS zooming into a sub-16px input; globals.css fixes
   * that cause instead, so the accessibility failure isn't needed.
   */
  viewportFit: "cover",
  /** Makes Android's keyboard shrink the layout viewport, as iOS already does. */
  interactiveWidget: "resizes-content",
  // One surface, one bar colour: the near-black ground the app actually paints.
  themeColor: "#0b0d10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${fraunces.variable} ${plexMono.variable}`}
      // Next 16 no longer overrides scroll-behavior during navigation unless
      // asked. Without this a smooth in-page scroll would also apply to route
      // changes, which should land instantly at the top.
      data-scroll-behavior="smooth"
    >
      <body className="antialiased">
        {children}
        <Toaster
          position="top-center"
          theme="dark"
          toastOptions={{
            style: {
              background: "hsl(213.3 14.3% 12.4%)",
              border: "1px solid hsl(213 13% 18%)",
              color: "hsl(36.9 37.1% 93.1%)",
            },
          }}
        />
      </body>
    </html>
  );
}
