"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/layout/Mark";
import {
  HomeIcon,
  ActivityIcon,
  ConvertIcon,
  BillsIcon,
  ProfileIcon,
  AdminIcon,
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
 * of a 1440px window is a phone control stranded on a desktop.
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

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sm:flex">
      <div className="px-5 py-5">
        <Link href="/home" aria-label="justpae home">
          <Wordmark />
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 px-3">
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
        <Link href="/home" aria-label="justpae home">
          <Wordmark />
        </Link>
      )}
    </header>
  );
}
