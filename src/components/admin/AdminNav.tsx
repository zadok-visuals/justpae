"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/layout/Mark";
import { Pill } from "@/components/ui/Primitives";
import { BACK_BUTTON_CLASS } from "@/lib/ui/escapeControl";

/**
 * GROUP 6b — the admin navigation.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACED, AND WHY A PILL ROW COULD NOT BE FIXED
 *
 * Ten destinations in one horizontally scrolling row of pills across the top
 * of every admin page. At 1280px the row ran past the right edge and the last
 * entry rendered as "Acti…" — an operator could not read the name of the
 * page they were navigating to. The obvious patches all fail:
 *
 *   shorter labels      "Act" for Activity is not a name, it is a riddle
 *   smaller text        a 44px tap target with 11px text, on the one surface
 *                       whose users spend all day in it
 *   wrap to two rows    twenty pills in two rows is twenty pills; the problem
 *                       is that a flat list of ten gives no structure to scan
 *   scroll it           it already scrolled, which is how "Acti…" happened —
 *                       a scroll rail hides the existence of what is past the
 *                       edge, so an operator had no way to know Activity and
 *                       Security were even there
 *
 * The real problem is that ten peers in one row is not information
 * architecture. These ten are not peers: four are WORK QUEUES with a depth
 * that changes minute to minute, three are money configuration, two are
 * people, two are system records. Grouping them is what makes the list
 * scannable, and a sidebar is what has room for groups.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE BADGES ARE THE POINT OF THE QUEUES GROUP
 *
 * An admin's actual question on arriving is "what needs me", and the pill row
 * could not answer it — every pill looked identical whether its queue held
 * zero items or forty, so finding out meant opening all four. The counts come
 * from admin_dashboard_stats() (migration 0019), which is one round trip for
 * all of them, read once in the layout and passed down.
 *
 * A zero renders NOTHING rather than a "0" badge. A row of zeroes is visual
 * noise that trains the eye to ignore the position the real number appears
 * in, which is the opposite of what a badge is for.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * MOBILE: A DRAWER, WHICH IS THE OPPOSITE OF THE CUSTOMER APP'S ANSWER
 *
 * DashboardChrome argues against a drawer for customers, and that reasoning
 * is right there and wrong here. It rests on there being five destinations
 * that fit in a bottom bar; admin has thirteen, which fit in nothing. The
 * other half of that argument — a drawer hides the information architecture —
 * is exactly what the scrolling pill row was already doing, except worse,
 * because a rail gives no indication that anything is past its edge while a
 * menu button plainly says there is more.
 *
 * One tree, switched by CSS, as in DashboardChrome: no viewport check in JS
 * and no hydration mismatch.
 */

export interface AdminNavCounts {
  verification: number;
  /** GROUP 4 — manual naira transfers claimed as sent and not yet checked. */
  deposits: number;
  withdrawals: number;
  payToChina: number;
  support: number;
}

type CountKey = keyof AdminNavCounts;

interface AdminLink {
  href: string;
  label: string;
  /** Which queue depth to badge this row with, when it has one. */
  count?: CountKey;
}

/**
 * The groups, in the order an operator works through them: what needs doing,
 * then what it is priced at, then who it was for, then the audit trail.
 */
const GROUPS: { title: string; links: AdminLink[] }[] = [
  {
    title: "Overview",
    links: [{ href: "/admin", label: "Dashboard" }],
  },
  {
    title: "Queues",
    links: [
      { href: "/admin/kyc", label: "Verification", count: "verification" },
      // Above Withdrawals: money coming IN is waiting on us before the
      // customer can do anything else, and a deposit left unchecked is
      // somebody's money already sent and not yet theirs.
      { href: "/admin/deposits", label: "Deposits", count: "deposits" },
      { href: "/admin/withdrawals", label: "Withdrawals", count: "withdrawals" },
      { href: "/admin/pay-to-china", label: "Pay to China", count: "payToChina" },
      { href: "/admin/support", label: "Support", count: "support" },
    ],
  },
  {
    title: "Money",
    links: [
      { href: "/admin/transactions", label: "Transactions" },
      { href: "/admin/rates", label: "Rates" },
      /**
       * Margin and PNL are two different questions and two different places,
       * which is why the brief lists both:
       *
       *   Margin  what spread we CHARGE. Configured under "Current markups"
       *           on the rates page, which is the only screen that can set it.
       *   PNL     what we actually MADE. /admin/pnl, computed from settled
       *           transactions.
       *
       * The fragment is why this is not a duplicate link: #markups scrolls to
       * the section that answers the first question, on a page whose own entry
       * above answers a third ("what are today's rates"). Deep-linking a
       * section rather than inventing a route for it keeps one editor for one
       * setting.
       */
      { href: "/admin/rates#markups", label: "Margin" },
      { href: "/admin/pnl", label: "PNL" },
      // GROUP 4a. Under Money rather than System: it is a balance sheet, and
      // the question it answers ("can we pay tomorrow") belongs beside what
      // we charge and what we made.
      { href: "/admin/treasury", label: "Treasury" },
    ],
  },
  {
    title: "People",
    links: [
      { href: "/admin/users", label: "Accounts" },
      { href: "/admin/notifications", label: "Notifications" },
    ],
  },
  {
    title: "System",
    links: [
      { href: "/admin/activity", label: "Activity" },
      { href: "/admin/security", label: "Security" },
    ],
  },
];

/**
 * Active state.
 *
 * EXACT for /admin, prefix for everything else. A `startsWith("/admin")`
 * check would light Dashboard on all thirteen pages — the bug that makes an
 * active state worse than none, because it is confidently wrong about where
 * you are.
 *
 * The fragment is stripped before matching: /admin/rates#markups and
 * /admin/rates are the same document, so both rows light on that page. That
 * is honest rather than sloppy — the operator IS on both.
 */
function isActive(pathname: string, href: string): boolean {
  const path = href.split("#")[0]!;
  if (path === "/admin") return pathname === "/admin";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavList({
  counts,
  pathname,
  onNavigate,
}: {
  counts: AdminNavCounts;
  pathname: string;
  /** Closes the mobile drawer. Absent on desktop, where there is nothing to close. */
  onNavigate?: () => void;
}) {
  return (
    <>
      {GROUPS.map((group) => (
        /* GROUP 3 — a rule above each group but the first, 16px of air over
           it. The line is what stops OVERVIEW / QUEUES / MONEY reading as a
           first row of links: a heading that is merely smaller text in the
           same stack is still in the stack. */
        <div
          key={group.title}
          className="mt-4 border-t border-sidebar-border pt-3 first:mt-0 first:border-t-0 first:pt-0"
        >
          {/* A real heading, not a styled div: an operator navigating by
              screen reader gets the same grouping a sighted one does, which
              is the entire improvement over the flat pill row.
              Not focusable and no hover — an <h2> is neither by default, and
              nothing here adds them, so the one thing that lights up under a
              cursor is a thing you can actually go to.
              muted-foreground, NOT tertiary-foreground: the brief asks for
              the tertiary tone and the token's own note in globals.css says
              "never small text" — #98A2B3 under 11px on the light sidebar is
              about 2.4:1. Muted is the quietest tone that stays readable, and
              with the links now at full foreground the hierarchy still
              reads. */}
          <h2 className="mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {group.title}
          </h2>
          <ul className="space-y-0.5">
            {group.links.map((link) => {
              const active = isActive(pathname, link.href);
              const count = link.count ? counts[link.count] : 0;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-[0.9375rem] font-medium transition-colors ${
                      active
                        ? "bg-sidebar-accent text-primary"
                        : "text-foreground hover:bg-sidebar-accent active:bg-sidebar-accent"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
                    {/* Zero renders nothing — see the note at the top. The
                        count is in the accessible name too, so it is not
                        conveyed by a visual badge alone. */}
                    {count > 0 && (
                      <Pill tone="pending" className="shrink-0 tabular-nums">
                        {count > 99 ? "99+" : count}
                        <span className="sr-only"> waiting</span>
                      </Pill>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/** The role chip and the way out, shared by the sidebar foot and the drawer foot. */
function NavFooter({ role, email }: { role: string; email: string }) {
  return (
    <div className="shrink-0 space-y-2 border-t border-sidebar-border px-3 py-3">
      {/* The role is shown because what an admin may do now differs by it — a
          plain admin finds the grant controls absent rather than broken, and
          seeing "admin" explains why. */}
      <Link
        href="/admin/security"
        className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <span className="rounded-full bg-secondary px-2 py-0.5 font-mono">{role}</span>
        <span className="min-w-0 truncate">{email}</span>
      </Link>

      {/* GROUP 6b asks for this at the BOTTOM and in the brand colour. Same
          class as every other escape control in the product — see
          src/lib/ui/escapeControl.ts. */}
      <Link href="/home" className={`px-3 ${BACK_BUTTON_CLASS}`}>
        <span aria-hidden="true">←</span>
        Back to app
      </Link>
    </div>
  );
}

export function AdminNav({
  counts,
  role,
  email,
}: {
  counts: AdminNavCounts;
  role: string;
  email: string;
}) {
  const pathname = usePathname();

  /**
   * The drawer's state is the PATH IT WAS OPENED ON, not a boolean.
   *
   * It has to close on a route change — otherwise tapping a link leaves it
   * covering the page it just navigated to. Written as a boolean plus an
   * effect that resets it, that is a synchronous setState inside an effect: a
   * cascading render, and a lint error under react-hooks/set-state-in-effect.
   *
   * Storing the path instead makes closing a DERIVED fact — the moment
   * `pathname` changes, `openedAt === pathname` is false and the drawer is
   * shut, with no effect, no second render, and nothing to forget. It also
   * covers the case `onNavigate` cannot: a browser Back or Forward while the
   * drawer is open.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const drawerOpen = openedAt === pathname;
  const setDrawerOpen = (open: boolean) => setOpenedAt(open ? pathname : null);

  // Escape closes it. Subscribing to an external system (the window's key
  // events) is exactly what an effect is for, and setOpenedAt is called from
  // the listener rather than from the effect body — so no cascading render.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenedAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // GROUP 1c. Locks the page behind the drawer rather than letting it scroll
  // under the scrim — a touch drag on the backdrop would otherwise scroll
  // <body> while the drawer sits fixed on top of it.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────
          w-60 and the sidebar ground, matching the customer app's sidebar
          exactly, because an admin is the same person switching context and
          two different chromes for one product is two products.

          GROUP 1b — lg:sticky lg:top-0 lg:h-dvh, not self-stretch. Beside a
          flex row, self-stretch makes this element as tall as its tallest
          sibling — on a long admin page that is <main>, so the sidebar grew
          past the viewport and scrolled away with the page. h-dvh caps it to
          the viewport's own height regardless of sibling height, and sticky
          keeps it pinned there as the page scrolls, so only the content
          scrolls with the window. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex lg:sticky lg:top-0 lg:h-dvh">
        <div className="shrink-0 border-b border-sidebar-border px-5 py-3">
          <Link href="/admin" aria-label="justpae admin" className="inline-flex min-h-11 items-center">
            <Wordmark />
          </Link>
        </div>

        {/* min-h-0: a flex child's default min-height is its content size, not
            0 — without it overflow-y-auto never actually triggers, because
            the nav simply grows to fit every link instead of scrolling. */}
        <nav aria-label="Admin" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <NavList counts={counts} pathname={pathname} />
        </nav>

        <NavFooter role={role} email={email} />
      </aside>

      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-label="Admin menu"
          className="-ml-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary transition-colors hover:bg-sidebar-accent active:scale-95"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ☰
          </span>
          Menu
          {/* The total across every queue, on the button itself. Without it a
              closed drawer hides the only urgent information on the page. */}
          {totalWaiting(counts) > 0 && (
            <Pill tone="pending" className="tabular-nums">
              {totalWaiting(counts)}
              <span className="sr-only"> items waiting</span>
            </Pill>
          )}
        </button>

        <Link href="/admin" aria-label="justpae admin" className="inline-flex min-h-11 items-center">
          <Wordmark />
        </Link>
      </header>

      {drawerOpen && (
        <>
          {/* Scrim. A real button so Escape is not the only way out for a
              keyboard user, and so a tap anywhere outside closes it. */}
          <button
            type="button"
            aria-label="Close the admin menu"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm lg:hidden"
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar lg:hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-5 py-3">
              <Wordmark />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close the admin menu"
                className="-mr-2 flex size-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-sidebar-accent active:scale-95"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            {/* min-h-0, for the same reason the desktop sidebar's nav has it
                — and this is where its absence actually bit: a flex child's
                default min-height is its content, so overflow-y-auto never
                fired, the nav grew past the drawer, and PNL, People and
                System sat below the viewport with no way to reach them. The
                footer is outside this element, so it stays pinned. */}
            <nav aria-label="Admin" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <NavList
                counts={counts}
                pathname={pathname}
                onNavigate={() => setDrawerOpen(false)}
              />
            </nav>

            <NavFooter role={role} email={email} />
          </div>
        </>
      )}
    </>
  );
}

function totalWaiting(counts: AdminNavCounts): number {
  return (
    counts.verification +
    counts.deposits +
    counts.withdrawals +
    counts.payToChina +
    counts.support
  );
}
