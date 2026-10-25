import { ImageResponse } from "next/og";

/**
 * The card a shared justpae link renders as. Before this, a link pasted into
 * WhatsApp or Slack was a bare URL.
 *
 * Generated rather than a committed PNG, so it stays in step with the brand
 * tokens instead of being a stale export nobody remembers to redo. Drawn with
 * plain divs and inline styles because Satori — what next/og renders with —
 * supports a deliberate subset of CSS and does not run Tailwind.
 *
 * The mark is redrawn here as an inline SVG rather than imported from
 * Mark.tsx: that component paints with var() tokens, which resolve to nothing
 * outside the app's own stylesheet, so importing it would render an invisible
 * mark on a dark card.
 *
 * No system font is loaded — Satori falls back to its own, and a decorative
 * face is not worth a network fetch on every crawl of a page that must respond
 * fast enough for a crawler to wait.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "justpae — hold, convert and send money across borders";

const INK = "#0b0d10";
const BRAND = "#5b7cff";
const MARK_BLUE = "#5b7cff";
const MARK_GREEN = "#32d583";
const MUTED = "#9aa4b2";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="76" height="76" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#15181c" />
            <path
              d="M40 17v20.5c0 5.8-4.6 10.5-10.3 10.5-4.4 0-8.2-2.8-9.7-6.8"
              stroke={MARK_BLUE}
              strokeWidth="6.5"
              strokeLinecap="round"
              fill="none"
            />
            <path d="M29 26.5h18" stroke={MARK_GREEN} strokeWidth="5.5" strokeLinecap="round" fill="none" />
          </svg>
          <span style={{ color: "#f3f5f7", fontSize: 54, fontWeight: 600, letterSpacing: -1 }}>
            justpae
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ color: "#f3f5f7", fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
            Money that moves between{" "}
            <span style={{ color: BRAND }}>the currencies you actually use.</span>
          </span>
          <span style={{ color: MUTED, fontSize: 30, lineHeight: 1.4 }}>
            Hold dollars, naira, cedis, shillings and USDT in one account. Convert at live rates.
          </span>
        </div>

        {/* No invented numbers here either — the landing page refuses to claim a
            user count or a volume, and a social card is not the place to start. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 4, background: BRAND, borderRadius: 2 }} />
          <span style={{ color: MUTED, fontSize: 24 }}>justpae.com</span>
        </div>
      </div>
    ),
    size,
  );
}
