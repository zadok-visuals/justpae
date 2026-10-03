"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Wordmark } from "@/components/layout/Mark";
import { logOut } from "@/lib/actions/auth";
import { useCurrentPageTitle } from "@/components/layout/PageTitleContext";
import {
  HomeIcon,
  ActivityIcon,
  ConvertIcon,
  BillsIcon,
  ProfileIcon,
  AdminIcon,
  LogOutIcon,
} from "@/components/layout/NavIcons";

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

const TABS = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/transactions", label: "Activity", Icon: ActivityIcon },
  { href: "/convert", label: "Convert", Icon: ConvertIcon },
  { href: "/bills", label: "Bills", Icon: BillsIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
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

  return (
    <div className="hidden shrink-0 items-center border-b border-sidebar-border sm:flex">
      <div className="flex w-60 shrink-0 items-center px-5 py-3">
        <Link href="/home" aria-label="justpae home" className="inline-flex min-h-11 items-center">
          <Wordmark />
        </Link>
      </div>

      <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold text-foreground">
        {title}
      </h1>

      <div className="flex shrink-0 items-center px-5">
        <Link
          href="/profile"
          aria-label="Profile"
          className="flex size-10 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-foreground"
        >
          {initialsFor(userName)}
        </Link>
      </div>
    </div>
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
      <nav aria-label="Sidebar" className="flex-1 px-3 py-3">
        <ul className="space-y-1">
          {TABS.map(({ href, label, Icon }) => {
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
                  {label}
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
      <form action={logOut} className="shrink-0 border-t border-sidebar-border px-3 py-3">
        <SidebarLogOutButton />
      </form>
    </aside>
  );
}

/**
 * Mobile top bar. Carries the mark and the page title only — every
 * destination lives in the bottom bar, so there is nothing to hide behind a
 * hamburger.
 */
export function MobileTopBar({ title }: { title?: string }) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md sm:hidden">
      {title ? (
        <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
      ) : (
        <Link href="/home" aria-label="justpae home" className="inline-flex min-h-11 items-center">
          <Wordmark />
        </Link>
      )}
    </header>
  );
}
