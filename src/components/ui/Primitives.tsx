import Link from "next/link";
import type { TransactionStatus } from "@/lib/types/database";

/** Surfaces, pills, skeletons, empty states — the non-interactive furniture. */

export function Card({
  children,
  className = "",
  as: As = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <As className={`rounded-xl border border-border bg-card p-4 ${className}`}>{children}</As>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {action && (
        // -my-* plus min-h-11 gives a 44px touch target without adding
        // vertical space to the header: a 20px link is a miss on a phone
        // however neatly it sits next to the title.
        <Link
          href={action.href}
          className="-my-3 inline-flex min-h-11 items-center text-sm font-medium text-primary"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

type StatusTone = "pending" | "success" | "failed" | "neutral";

const STATUS_TONES: Record<StatusTone, string> = {
  // Pending is amber, not the brand blue: blue now means "this is the app
  // talking to you", and a pending chip is a state, not a brand moment.
  pending: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
  neutral: "bg-accent text-muted-foreground",
};

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "pending" },
  processing: { label: "In progress", tone: "pending" },
  completed: { label: "Completed", tone: "success" },
  // 0023's status, for a two-leg conversion whose first leg landed and whose
  // second has not. Without an entry here it rendered as the raw enum value.
  partially_completed: { label: "Partly done", tone: "pending" },
  failed: { label: "Failed", tone: "failed" },
  refunded: { label: "Refunded", tone: "neutral" },
  // 0029's status, for a deposit whose transfer details expired before any
  // money arrived. Neutral, not "failed": the tone is the message. Nothing
  // went wrong and nothing was taken — the window simply closed.
  expired: { label: "Expired", tone: "neutral" },
};

export function StatusPill({ status }: { status: TransactionStatus | "refunded" }) {
  const meta = STATUS_LABELS[status] ?? { label: status, tone: "neutral" as StatusTone };
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}

/**
 * Skeletons, never "Loading…".
 *
 * A shimmer block the size of the content tells the reader what is about to
 * appear and keeps the layout from jumping when it does. The word "Loading"
 * does neither.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`jp-skeleton rounded-md ${className}`} />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          // The last line stops short, the way a real paragraph does.
          className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * A form's worth of skeleton: label stub, field stub, repeated, then a button.
 * Used by the route-level loading.tsx of every form page so the field stack
 * doesn't shift when the real labels arrive.
 */
export function SkeletonForm({ fields = 3, button = true }: { fields?: number; button?: boolean }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          {/* h-12 is the real field height — see .jp-field in globals.css. */}
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
      {button && <Skeleton className="h-12 w-full rounded-lg" />}
    </div>
  );
}

/** A card-shaped block, for pages whose body is a stack of Cards. */
export function SkeletonCard({ className = "h-32" }: { className?: string }) {
  return <Skeleton className={`w-full rounded-xl ${className}`} />;
}

/**
 * An empty state always carries an action. "No transactions yet" alone is a
 * dead end; the person reading it came here to do something.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="mt-1 inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** A labelled value row, the unit the transaction detail view is built from. */
export function DetailRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 break-words text-right text-sm font-medium text-foreground ${
          mono ? "font-mono" : ""
        }`}
      >
        {children}
      </span>
    </div>
  );
}

export function Banner({
  tone = "info",
  title,
  children,
  action,
  live = false,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title: string;
  children?: React.ReactNode;
  action?: { href: string; label: string };
  /**
   * Announce this banner when it appears.
   *
   * OPT-IN, not automatic. Most banners here are standing page furniture — the
   * KYC gate on /withdraw, "bill payments are coming soon" — and marking those
   * live would have a screen reader read the page's static chrome aloud on
   * every render. What this is for is the banner that appears as the RESULT of
   * something the user just did: a failed withdrawal, a biller's name lookup,
   * a destination saved. Those are currently announced to nobody, which is the
   * whole of audit finding 10.1.
   *
   * A danger tone gets role="alert" (interrupting, because a money action just
   * failed); everything else gets a polite region that waits for a pause.
   */
  live?: boolean;
}) {
  const tones = {
    info: "border-border bg-secondary",
    warning: "border-warning/40 bg-warning-soft",
    danger: "border-destructive/40 bg-destructive/10",
    success: "border-success/40 bg-success/10",
  } as const;

  return (
    <div
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      aria-live={live ? (tone === "danger" ? "assertive" : "polite") : undefined}
      className={`rounded-xl border p-4 ${tones[tone]}`}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
      {action && (
        <Link
          href={action.href}
          className="-mb-2 mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}
