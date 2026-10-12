"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BellIcon } from "@/components/layout/NavIcons";
import {
  listNotifications,
  markAllNotificationsRead,
  type NotificationListItem,
} from "@/lib/actions/notifications";

/**
 * The notification bell and its dropdown.
 *
 * MOBILE OVERFLOW, which is the detail this component exists to get right: the
 * panel is anchored to the VIEWPORT below `sm` (`fixed inset-x-4`) and to the
 * bell only from `sm` up (`absolute right-0 w-80`). Positioning a 320px panel
 * off a 40px button works fine on a desktop and pushes its left edge clean off
 * a 375px screen — so the panel is unreadable on exactly the devices most of
 * this product's users hold.
 *
 * The list is fetched on open rather than rendered with the page. A bell is
 * opened rarely, the unread COUNT is what needs to be current, and loading
 * fifteen notification bodies into every dashboard payload to support an
 * interaction most sessions never perform is the wrong trade.
 */
export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationListItem[] | null>(null);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the badge honest when the server re-renders the chrome with a new
  // count (e.g. after navigating).
  //
  // Adjusted DURING RENDER against a remembered copy of the prop, not in an
  // effect. This is React's documented pattern for "reset some state when a
  // prop changes" and it is better than the effect it replaces in a way that
  // is visible: an effect runs AFTER paint, so the badge would render one
  // frame with the stale count and then flip. React re-runs this render
  // immediately, before anything is committed to the screen, so there is no
  // intermediate frame.
  const [lastServerCount, setLastServerCount] = useState(initialUnreadCount);
  if (initialUnreadCount !== lastServerCount) {
    setLastServerCount(initialUnreadCount);
    setUnread(initialUnreadCount);
  }

  // Click-outside and Escape. Both, because a dropdown that only closes on
  // Escape is unusable with a thumb and one that only closes on outside-click
  // traps keyboard users.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    const rows = await listNotifications();
    setItems(rows);

    if (rows.some((r) => !r.read)) {
      // Optimistic: the badge clears the moment the panel opens, because the
      // user HAS now seen them. The server call is what persists it.
      setUnread(0);
      startTransition(() => {
        void markAllNotificationsRead();
      });
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      >
        <BellIcon className="size-5" />
        {unread > 0 && (
          <span
            // aria-hidden: the count is already in the button's own label, and
            // announcing "9" on its own after "Notifications, 9 unread" is
            // just noise.
            aria-hidden="true"
            className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-4 text-primary-foreground"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-4 top-16 z-50 max-h-[70dvh] overflow-y-auto rounded-xl border border-border bg-card shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
          </div>

          {items === null ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing yet. We&apos;ll tell you here when something happens on your account.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const content = (
                  <>
                    <div className="flex items-start gap-2">
                      {!item.read && (
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                      <span className="text-sm font-medium text-foreground">{item.title}</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                    <time
                      dateTime={item.created_at}
                      className="mt-1.5 block font-mono text-[0.6875rem] text-muted-foreground"
                    >
                      {new Date(item.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </>
                );

                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="block px-4 py-3 hover:bg-secondary"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
