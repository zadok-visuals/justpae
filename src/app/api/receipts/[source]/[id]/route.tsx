import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin";
import { loadActivityDetail, type ActivityDetail } from "@/lib/activity/detail";
import { receiptTitle } from "@/lib/activity/receiptTitle";
import { formatAmount, formatRate } from "@/lib/currencies";
import type { ActivitySource } from "@/lib/transactions";

/**
 * GROUP 4a — the receipt, as an image.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY A SERVER ROUTE AND NOT A CANVAS IN THE BROWSER
 *
 * The receipt it replaces was a .txt file built in the client from the same
 * props the sheet was already rendering. That is the cheapest possible
 * implementation and it produced an artefact nobody wants: a customer
 * forwarding proof of a payment to a supplier, a landlord or a support
 * queue is sending a text file with no branding, no logo, and nothing that
 * distinguishes it from a note they typed themselves.
 *
 * Rendering it here, server-side, buys three things a client-side canvas
 * does not:
 *
 *   1. The figures come from the DATABASE at the moment of download, not
 *      from whatever the open sheet last polled. A receipt that disagrees
 *      with the ledger is worse than no receipt.
 *   2. It is a URL. That makes it shareable, re-fetchable, and usable by the
 *      Web Share API on a phone without the page having to hold a blob
 *      alive.
 *   3. No image-generation library enters the client bundle, on a product
 *      whose users are mostly on mid-range Android phones.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE AUTHORISATION RULE, WHICH IS THE WHOLE POINT OF THE ROUTE
 *
 * A receipt URL is guessable in shape (`/api/receipts/transaction/<uuid>`),
 * so the check cannot be "does this row exist". It is, in order:
 *
 *   - there must be a signed-in user, verified with getUser() — not
 *     getClaims(), because this is authorisation rather than routing and a
 *     revoked-but-unexpired token must not mint a receipt;
 *   - that user's OWN row is loaded first, scoped by `.eq("user_id", …)` as
 *     well as by RLS;
 *   - only if that finds nothing do we ask whether the caller is an admin,
 *     and only then is the row re-read with the service role, for its real
 *     owner.
 *
 * Ordering it that way means the common path never touches the service-role
 * client at all, and the privileged path is entered only for a caller the
 * database has already confirmed is an admin.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SATORI'S CONSTRAINTS, WHICH SHAPE EVERY STYLE BELOW
 *
 * next/og renders with Satori: flexbox only (no grid), a subset of CSS, and
 * every element with more than one child needs an explicit `display: flex`.
 * The brand tokens are restated as literals here for the same reason
 * opengraph-image.tsx restates them — `var(--…)` resolves to nothing outside
 * the app's stylesheet, and a receipt drawn in invisible ink is a bug that
 * only shows up after a customer has already sent it to someone.
 */

export const runtime = "nodejs";
// A receipt reflects a row that can still change (a pending deposit
// completing, a withdrawal failing). Never cached.
export const dynamic = "force-dynamic";

const INK = "#0b0d10";
const PANEL = "#15181c";
const GOLD = "#d9a14a";
const TEXT = "#f3f5f7";
const MUTED = "#9aa4b2";
const BORDER = "#242a31";
const SUCCESS = "#4ade80";
const DANGER = "#f87171";

const WIDTH = 1000;

const VALID_SOURCES: ActivitySource[] = ["transaction", "deposit", "bill"];

function isActivitySource(value: string): value is ActivitySource {
  return (VALID_SOURCES as string[]).includes(value);
}

/** Which table a source lives in, for the admin owner lookup. */
const TABLE_FOR: Record<ActivitySource, "transactions" | "deposits" | "bill_payments"> = {
  transaction: "transactions",
  deposit: "deposits",
  bill: "bill_payments",
};

function statusColour(status: string): string {
  if (status === "completed") return SUCCESS;
  if (status === "failed" || status === "refunded") return DANGER;
  return GOLD;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ source: string; id: string }> },
) {
  const { source: rawSource, id } = await context.params;

  if (!isActivitySource(rawSource)) {
    return new Response("Not found", { status: 404 });
  }
  const source: ActivitySource = rawSource;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 401, not a redirect to /login: this is an image URL, and an <img> that
  // silently resolves to a login page renders as a broken receipt rather
  // than as the error it is.
  if (!user) return new Response("Sign in to download a receipt.", { status: 401 });

  // ── Own row first ───────────────────────────────────────────────────────
  let state = await loadActivityDetail(supabase, user.id, source, id);
  let detail = state.detail ?? null;

  // ── Then, and only then, the admin path ─────────────────────────────────
  if (!detail) {
    const admin = await isAdmin(user.id, user.email);
    if (admin) {
      const service = createAdminClient();
      const { data: owner } = await service
        .from(TABLE_FOR[source])
        .select("user_id")
        .eq("id", id)
        .maybeSingle();

      if (owner?.user_id) {
        // The service client, scoped to the row's REAL owner — so every
        // `.eq("user_id", …)` inside the loader still matches, and the
        // balance and recipient lookups resolve against the right person
        // rather than against the admin.
        state = await loadActivityDetail(
          service as unknown as Awaited<ReturnType<typeof createClient>>,
          owner.user_id,
          source,
          id,
        );
        detail = state.detail ?? null;
      }
    }
  }

  if (!detail) return new Response("Receipt not found.", { status: 404 });

  const title = receiptTitle(detail);
  const rows = receiptRows(detail);
  // 320 of chrome (header, amount block, footer) plus each row's height. A
  // fixed canvas would either clip a Pay to China receipt or leave a
  // conversion receipt half empty.
  const height = 430 + rows.length * 54;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: INK,
          padding: 56,
        }}
      >
        {/* ── Header: the mark, and what this is a receipt for ───────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="52" height="52" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="14" fill={PANEL} />
              <path
                d="M40 17v20.5c0 5.8-4.6 10.5-10.3 10.5-4.4 0-8.2-2.8-9.7-6.8"
                stroke={GOLD}
                strokeWidth="6.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M29 26.5h18"
                stroke={GOLD}
                strokeWidth="5.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span style={{ color: TEXT, fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>
              justpae
            </span>
          </div>

          <span
            style={{
              color: MUTED,
              fontSize: 20,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            Receipt
          </span>
        </div>

        {/* ── The amount and the status, which is what the receipt is FOR ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 40,
            marginBottom: 32,
          }}
        >
          <span style={{ color: MUTED, fontSize: 24 }}>{title}</span>
          <span
            style={{
              color: TEXT,
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: -1,
              marginTop: 8,
            }}
          >
            {formatAmount(detail.sourceCurrency, detail.sourceAmount)}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 14,
              paddingTop: 7,
              paddingBottom: 7,
              paddingLeft: 18,
              paddingRight: 18,
              borderRadius: 999,
              border: `1px solid ${BORDER}`,
              background: PANEL,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: statusColour(detail.status),
              }}
            />
            <span style={{ color: statusColour(detail.status), fontSize: 22, fontWeight: 600 }}>
              {statusLabel(detail.status)}
            </span>
          </div>
        </div>

        {/* ── The detail rows ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRadius: 18,
            border: `1px solid ${BORDER}`,
            background: PANEL,
            paddingLeft: 26,
            paddingRight: 26,
          }}
        >
          {rows.map((row, index) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 16,
                paddingBottom: 16,
                borderTop: index === 0 ? "none" : `1px solid ${BORDER}`,
              }}
            >
              <span style={{ color: MUTED, fontSize: 21 }}>{row.label}</span>
              <span
                style={{
                  color: TEXT,
                  fontSize: 21,
                  fontWeight: 600,
                  maxWidth: 560,
                  textAlign: "right",
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 3, background: GOLD, borderRadius: 2 }} />
            <span style={{ color: MUTED, fontSize: 20 }}>www.justpae.com</span>
          </div>
          <span style={{ color: MUTED, fontSize: 18 }}>
            {/* en-GB, matching every other date in the product. */}
            {new Date(detail.createdAt).toLocaleString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height,
      headers: {
        // Private: this is somebody's financial record, and a shared cache
        // holding it keyed only by URL is how one customer's receipt reaches
        // another's browser.
        "Cache-Control": "private, no-store",
      },
    },
  );
}

/**
 * Which lines a given receipt carries.
 *
 * Built as data rather than as JSX so the row count can size the canvas
 * above, and so "which fields does a withdrawal show" is answerable by
 * reading one function instead of a tree of conditionals.
 */
function receiptRows(detail: ActivityDetail): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const isConversion = detail.source === "transaction" && detail.type === "convert";
  const isWithdrawal = detail.source === "transaction" && detail.type === "withdrawal";
  const isPayToChina = detail.source === "transaction" && detail.type === "pay_to_china";

  rows.push({
    label: "Date and time",
    value: new Date(detail.createdAt).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  });

  if (detail.confirmedAmount != null) {
    rows.push({
      label: "Amount received",
      value: formatAmount(detail.sourceCurrency, detail.confirmedAmount),
    });
  }

  if (isConversion && detail.targetAmount != null && detail.targetCurrency) {
    rows.push({
      label: "You received",
      value: formatAmount(detail.targetCurrency, detail.targetAmount),
    });
  }

  if (isWithdrawal && detail.targetAmount != null) {
    rows.push({
      label: "Recipient receives",
      value: formatAmount(detail.sourceCurrency, detail.targetAmount),
    });
  }

  if (isPayToChina && detail.targetAmount != null) {
    rows.push({
      label: detail.status === "completed" ? "They received" : "They receive",
      value: formatAmount("CNY", detail.targetAmount),
    });
  }

  if (detail.fee != null && detail.fee > 0) {
    rows.push({ label: "Fee", value: formatAmount(detail.sourceCurrency, detail.fee) });
  }

  if (detail.customerRate != null && detail.targetCurrency) {
    rows.push({
      label: "Rate",
      value: formatRate(detail.sourceCurrency, detail.targetCurrency, detail.customerRate),
    });
  }

  if (detail.description) {
    rows.push({
      label: isWithdrawal ? "Sent to" : detail.source === "bill" ? "Paid to" : "Details",
      // Satori does not wrap a long unbroken string gracefully, and a USDT
      // address is exactly that. Truncated with the ends kept, which is the
      // part a person checks.
      value: truncateMiddle(detail.description, 52),
    });
  }

  if (detail.token) rows.push({ label: "Token", value: detail.token });
  if (detail.reference) {
    rows.push({ label: "Reference", value: truncateMiddle(detail.reference, 46) });
  }

  return rows;
}

function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}
