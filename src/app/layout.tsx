import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Fraunces, Manrope, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { siteUrl } from "@/lib/site";
import { NavigationTracker } from "@/components/layout/NavigationTracker";
import { THEME_COOKIE } from "@/lib/theme";
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
  /**
   * Required for the Open Graph and Twitter images to resolve to absolute
   * URLs. Without it Next emits a relative path, and every social scraper
   * silently drops the card — which looks exactly like not having one.
   */
  metadataBase: new URL(siteUrl()),
  title: {
    default: "justpae",
    template: "%s · justpae",
  },
  description:
    "Hold dollars, naira, cedis, shillings and USDT in one place. Convert at live rates, withdraw to your bank or mobile money, and pay your bills.",
  applicationName: "justpae",
  appleWebApp: { capable: true, title: "justpae", statusBarStyle: "black-translucent" },
};

/**
 * GROUP 9. NOT read from the cookie here. cookies()/headers() in the root
 * layout opts EVERY route under it out of static rendering — the landing
 * page, /terms, /privacy, /login, /signup, /forgot-password and the dev
 * pages all went from prerendered (○) to server-rendered-per-request (ƒ) the
 * first time this tried it, which is a real cost for a visitor who isn't
 * signed in yet and has no Profile preference to read anyway. The
 * media-conditional array form lets the browser's own OS setting pick the
 * colour with no server involvement, same as the CSS below. An explicit
 * in-app choice therefore doesn't repaint this one meta tag — a status bar
 * tint one shade off from a deliberately-chosen in-app theme is a cosmetic
 * nit, not a flash, and not worth making the whole app dynamic to fix.
 */
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
};

/**
 * GROUP 9 — the no-flash mechanism, and why it isn't a server-side cookie
 * read in this component. Reading the theme cookie here has the identical
 * all-routes-become-dynamic cost described above, for the exact same
 * reason: calling cookies() anywhere in a request's render opts that
 * request out of static generation, root layout or not.
 *
 * `beforeInteractive` is Next's own documented mechanism for precisely this
 * — a script guaranteed to run before hydration and before the page paints,
 * which is what actually prevents the flash (nothing here waits on a
 * server round trip). It reads document.cookie directly, synchronously, and
 * sets data-theme before the browser has painted anything: no flash, and no
 * server involvement. Profile's own page is already force-dynamic (it reads
 * the signed-in user), so ITS read of the cookie (getThemePreference, used
 * to show the toggle's current selection) costs nothing extra — that is the
 * one place a true server-side read remains, and the one place it needed to.
 */
const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var v=m&&decodeURIComponent(m[1]);if(v==="light"||v==="dark"){document.documentElement.setAttribute("data-theme",v);}}catch(e){}})();`;

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
        <Script id="jp-theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        {/* GROUP 5b. Mounted here, above every route group, because it has to
            outlive the pages it counts navigations between — a tracker inside
            a page only ever sees the last hop. Renders nothing. */}
        <NavigationTracker />
        {children}
        {/* theme="system" plus the inline style below reading our own CSS
            variables (rather than literal dark-theme hex/hsl values) is what
            makes toasts follow the active theme instead of always being
            dark — the variables already resolve correctly per the cascade
            rules in globals.css, so no extra logic is needed here. */}
        <Toaster
          position="top-center"
          theme="system"
          toastOptions={{
            style: {
              background: "hsl(var(--jp-card))",
              border: "1px solid hsl(var(--jp-border))",
              color: "hsl(var(--jp-foreground))",
            },
          }}
        />
      </body>
    </html>
  );
}
