"use client";

import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Wordmark } from "@/components/layout/Mark";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import { logOut } from "@/lib/actions/auth";
import { useCurrentPageTitle } from "@/components/layout/PageTitleContext";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useUnreadCounts } from "@/components/layout/UnreadCountsContext";
import {
  HomeIcon,
  AccountsIcon,
  ActivityIcon,
  ConvertIcon,
  BillsIcon,
  ProfileIcon,
  AdminIcon,
  LogOutIcon,
  SupportIcon,
  SendIcon,
  FlightsIcon,
} from "@/components/layout/NavIcons";
import { BILLS_ENABLED, FLIGHTS_ENABLED } from "@/lib/flags";
import { MaintenanceBadge } from "@/components/ui/MaintenanceBadge";

/**
 * The app chrome.
 *
 * MOBILE: a fixed bottom tab bar. Not a slide-out drawer. Five destinations
 * reachable with one thumb, always visible, with the current one marked — a
 * drawer hides the whole information architecture behind a tap and gives no
 * sense of place. The bar carries safe-area padding so it clears the home
 * indicator.
 *
 * DESKTOP: a left sidebar, and NO bottom bar. A tab bar pinned to the bottom
 * of a 1440px window is a phone control stranded on a desktop. The sidebar's
 * own logo row lives in TopBar instead of inside the sidebar — see TopBar's
 * comment for why.
 *
 * One tree, switched by CSS, so there is no viewport check in JS and no
 * hydration mismatch.
 */

/**
 * The destinations, and the one rule about them: A TAB THAT LEADS NOWHERE IS
 * WORSE THAN A MISSING TAB.
 *
 * Bills was a permanent fixture here and led to a screen behind a provider
 * that has not been chosen — a fifth of the bar, on every screen, going to a
 * coming-soon page. It was removed from the bar for that reason and it stays
 * removed: Group 4e makes Bills and Flights VISIBLE while under maintenance,
 * but visible in the sidebar, Home's quick actions and Profile — not in the
 * five slots a thumb reaches on every screen. A maintenance destination is
 * not somewhere people go repeatedly, which is the only thing this bar is
 * for.
 *
 * Accounts takes the slot it leaves. Every wallet now has a page worth
 * reaching (Group 5), and reaching it only by tapping a card on Home is not
 * navigation.
 *
 * PAY TO CHINA IS SIDEBAR-ONLY, and that asymmetry is the point. The bottom
 * bar has five slots and every one of them is a place people go repeatedly;
 * Pay to China is a thing people DO, like Convert or Withdraw, and those
 * reach it from Home's quick actions and from the wallet pages. The sidebar
 * has the room, so on desktop it is one click rather than two.
 */
const TABS = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/accounts", label: "Accounts", Icon: AccountsIcon },
  { href: "/convert", label: "Convert", Icon: ConvertIcon },
  { href: "/transactions", label: "Activity", Icon: ActivityIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
];

/**
 * GROUP 4e — the sidebar's list, now including the two features that are
 * visible while under maintenance.
 *
 * WHY THESE TWO ARE IN THE SIDEBAR AND NOT THE BOTTOM BAR. The bar has five
 * slots and every one is a place people go repeatedly. A maintenance screen
 * is not, and promoting one into a fifth of a phone's permanent navigation
 * would be worse than the "coming soon" tab this codebase already removed
 * once. The sidebar has the room, and a desktop user scanning it learns the
 * product does bills and flights — which is the whole point of showing them
 * at all.
 *
 * `maintenance` is computed from the flag, so flipping NEXT_PUBLIC_FEATURE_*
 * to true removes the badge and nothing else changes.
 */
const SIDEBAR_LINKS: {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  maintenance?: boolean;
}[] = [
  ...TABS.slice(0, -1),
  { href: "/pay-to-china", label: "Pay to China", Icon: SendIcon },
  { href: "/bills", label: "Bills", Icon: BillsIcon, maintenance: !BILLS_ENABLED },
  { href: "/flights", label: "Flights", Icon: FlightsIcon, maintenance: !FLIGHTS_ENABLED },
  TABS[TABS.length - 1]!,
];

function isActive(pathname: string, href: string): boolean {
  // Prefix match so /bills/airtime keeps the Bills tab lit, but exact for
  // /home — a startsWith("/home") check is fine here, while a bare "/" would
  // match everything.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      // Distinctly named from the sidebar's nav. Only one is ever in the
      // accessibility tree (the other's container is display:none), but two
      // landmarks sharing a name is confusing the moment that stops holding.
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md sm:hidden"
    >
      <ul className="flex items-stretch pb-[env(safe-area-inset-bottom,0px)]">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[0.6875rem] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-6" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** First letter of each of the first two words — "Ada Obi" → "AO", one word →
 *  its first letter. Falls back to "?" for an empty name rather than nothing,
 *  so the avatar circle is never blank. */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Shared desktop-only top strip. The logo used to live inside the sidebar's
 * own box, with nothing connecting it to the content column beside it — the
 * dividing rule below it stopped dead at the sidebar's right edge, and the
 * page's own title rendered separately, further down, in a second header of
 * its own. Pulling the logo AND the current page's title into one bar that
 * spans the full width — the title published by whichever PageShell is
 * mounted, via PageTitleContext — means there is one row and one rule, not
 * a logo strip stacked on top of a page header that happens to look similar.
 */
export function TopBar({ userName }: { userName: string }) {
  const title = useCurrentPageTitle();
  const { notifications: unreadNotifications, support: unreadSupport } = useUnreadCounts();

  return (
    <div className="hidden shrink-0 items-center border-b border-sidebar-border sm:flex">
      <div className="flex w-60 shrink-0 items-center self-stretch border-r border-sidebar-border bg-sidebar px-5 py-3">
        <Link href="/home" aria-label="justpae home" className="inline-flex min-h-11 items-center">
          <Wordmark />
        </Link>
      </div>

      <h1 className="min-w-0 flex-1 truncate px-6 font-display text-xl font-semibold text-foreground">
        {title}
      </h1>

      <div className="flex shrink-0 items-center gap-1 px-5">
        <SupportLink unread={unreadSupport} />
        <NotificationBell initialUnreadCount={unreadNotifications} />
        <Link
          href="/profile"
          aria-label="Profile"
          className="ml-1 flex size-11 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-foreground"
        >
          {initialsFor(userName)}
        </Link>
      </div>
    </div>
  );
}

/**
 * Support reachable from the header, not only from Profile.
 *
 * Someone who needs help is, by definition, already struggling with the
 * interface — making them find Settings first is the wrong moment to add a
 * navigation puzzle.
 */
function SupportLink({ unread }: { unread: number }) {
  return (
    <Link
      href="/support"
      aria-label={unread > 0 ? `Support, ${unread} unread` : "Support"}
      className="relative flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
    >
      <SupportIcon className="size-5" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-4 text-primary-foreground"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

function SidebarLogOutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50"
    >
      <LogOutIcon className="size-5" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar sm:flex">
      {/* The tab bar's destinations plus Pay to China, which the bar has no
          room for — see the note on TABS. */}
      <nav aria-label="Sidebar" className="flex-1 px-3 py-3">
        <ul className="space-y-1">
          {SIDEBAR_LINKS.map(({ href, label, Icon, maintenance }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                    active
                      ? "bg-sidebar-accent text-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="size-5" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {/* The badge is the whole reason the link is shown at all
                      while the flag is off — without it this is a navigation
                      item that leads somewhere disappointing. */}
                  {maintenance && <MaintenanceBadge className="shrink-0" />}
                </Link>
              </li>
            );
          })}
        </ul>

        {isAdmin && (
          <div className="mt-6 border-t border-sidebar-border pt-4">
            <Link
              href="/admin"
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                pathname.startsWith("/admin")
                  ? "bg-sidebar-accent text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              }`}
            >
              <AdminIcon className="size-5" />
              Admin
            </Link>
          </div>
        )}
      </nav>

      {/* Pinned below the (independently scrolling) nav list, not inside it —
          sign-out should never scroll out of reach on a tall nav. */}
      <SignOutForm />
    </aside>
  );
}

/**
 * Sign out, behind a confirmation.
 *
 * It sits directly under Profile in a narrow sidebar, which is exactly the
 * mis-tap that costs someone a re-authentication plus an email code in the
 * middle of a transfer.
 */
function SignOutForm() {
  const confirm = useConfirm<true>();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);

  return (
    <>
      <form
        ref={formRef}
        action={logOut}
        onSubmit={(event) => {
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return;
          }
          event.preventDefault();
          confirm.ask(true);
        }}
        className="shrink-0 border-t border-sidebar-border px-3 py-3"
      >
        <SidebarLogOutButton />
      </form>

      <ConfirmDialog
        open={confirm.open}
        title="Sign out?"
        body="You'll need your password to get back in, and a verification code if we don't recognise the device."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        destructive
        onCancel={confirm.cancel}
        onConfirm={() =>
          confirm.confirm(() => {
            confirmedRef.current = true;
            formRef.current?.requestSubmit();
          })
        }
      />
    </>
  );
}

/**
 * Mobile top bar. Carries the mark and the page title only — every
 * destination lives in the bottom bar, so there is nothing to hide behind a
 * hamburger.
 */
export function MobileTopBar({ title }: { title?: string }) {
  const { notifications: unreadNotifications, support: unreadSupport } = useUnreadCounts();

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md sm:hidden">
      {title ? (
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{title}</h1>
      ) : (
        <Link
          href="/home"
          aria-label="justpae home"
          className="inline-flex min-h-11 flex-1 items-center"
        >
          <Wordmark />
        </Link>
      )}

      {/* The bell's dropdown is viewport-anchored below sm, which is why it
          can live in a header this narrow at all — see NotificationBell. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <SupportLink unread={unreadSupport} />
        <NotificationBell initialUnreadCount={unreadNotifications} />
      </div>
    </header>
  );
}
