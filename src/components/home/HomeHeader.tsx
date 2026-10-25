"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { NotificationBell, UnreadDot } from "@/components/layout/NotificationBell";
import { SupportIcon } from "@/components/layout/NavIcons";
import { useUnreadCounts } from "@/components/layout/UnreadCountsContext";
import { HOME_HEADER_ICON_CLASS } from "@/lib/ui/escapeControl";
import { greetingFor } from "@/lib/home/greeting";

/**
 * Home's own header. It replaces MobileTopBar on this one route, which is why
 * PageShell takes a `mobileHeader` slot rather than this being wedged into
 * the shared bar.
 *
 * NO BORDER and no sticky background: Home opens on a greeting, not on a
 * chrome bar, and a rule under the avatar made the page read as a document
 * with a title rather than as a home screen.
 *
 * THE GREETING AND HYDRATION. "Good morning" depends on the reader's clock,
 * and the server has no access to it. Rendering it from the server's own
 * clock and then correcting it in an effect keeps the first paint identical
 * on both sides — so hydration matches — and fixes the one case that is
 * actually wrong (a user in a different timezone from the server) on the
 * frame after mount.
 */
const subscribeToNothing = () => () => {};

export function HomeHeader({
  initials,
  firstName,
  serverGreeting,
}: {
  initials: string;
  firstName: string | null;
  /** Computed on the server so the first paint matches; corrected on mount. */
  serverGreeting: string;
}) {
  const { notifications: unreadNotifications, support: unreadSupport } = useUnreadCounts();

  // The browser's clock is an external system, and this is what
  // useSyncExternalStore is for: React renders the server's snapshot into the
  // HTML, hydrates against it, then reads the real one. No effect, no
  // mismatch, and no frame of the wrong greeting. Nothing subscribes — the
  // hour changes rarely enough that re-reading on the next render is fine.
  const greeting = useSyncExternalStore(
    subscribeToNothing,
    () => greetingFor(new Date().getHours()),
    () => serverGreeting,
  );

  return (
    <header className="flex items-center justify-between gap-3 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:hidden">
      <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-base font-semibold text-primary"
        >
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block text-[0.8125rem] leading-tight text-muted-foreground">
            {greeting}
          </span>
          <span className="block truncate text-xl font-semibold leading-tight text-foreground">
            {firstName ?? "there"}
          </span>
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/support"
          aria-label={unreadSupport > 0 ? `Support, ${unreadSupport} unread` : "Support"}
          className={HOME_HEADER_ICON_CLASS}
        >
          <SupportIcon className="size-5" />
          {unreadSupport > 0 && <UnreadDot count={unreadSupport} />}
        </Link>

        <NotificationBell initialUnreadCount={unreadNotifications} appearance="home" />
      </div>
    </header>
  );
}
