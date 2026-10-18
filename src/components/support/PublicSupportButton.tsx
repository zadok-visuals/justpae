"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SupportIcon } from "@/components/layout/NavIcons";

/**
 * A way to reach a human from a page where nobody is signed in.
 *
 * WHY NOT THE CHAT. The in-app thread is per-account: `support_messages` is
 * keyed on user_id, every policy on it is `auth.uid() = user_id`, and
 * sendSupportMessage takes its user from `supabase.auth.getUser()`. There is
 * no row a logged-out visitor's message could belong to. Building one would
 * mean an unauthenticated, world-writable message table on a money product,
 * which is a spam target and an abuse surface in exchange for saving someone
 * one click.
 *
 * So this offers what actually exists: email for anyone, and the real thread
 * for anyone who has an account. The distinction matters because the two
 * have genuinely different answers — a signed-in customer's message arrives
 * attached to their account and their transaction history, and an email does
 * not.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not promise a response time.
 * The in-app thread can say "usually within a few hours" because it is
 * staffed and monitored; a public inbox reached from a landing page is not
 * the same queue, and a promise made to someone who has not signed up yet is
 * the easiest one to break.
 */
export function PublicSupportButton() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus goes back to the button that opened it —
  // otherwise a keyboard user who dismisses the panel is left at the top of
  // the document with no idea where they are.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    // bottom-right, above the safe area so it clears a phone's home
    // indicator. z-40 rather than 50: a toast or a modal must still be able
    // to cover it.
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Contact support"
          // inset-x-4 on a phone so a fixed-width panel cannot push the page
          // sideways on a 360px screen; a normal anchored panel from sm up.
          className="fixed inset-x-4 bottom-20 rounded-xl border border-border bg-card p-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:w-80"
        >
          <p className="text-sm font-semibold text-foreground">Need a hand?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Email us and a real person will reply.
          </p>

          <a
            href="mailto:support@justpae.com"
            className="mt-3 flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            support@justpae.com
          </a>

          <p className="mt-3 text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/support" className="font-medium text-primary hover:underline">
              Message us in the app
            </Link>{" "}
            — we&apos;ll see your account and history alongside what you write.
          </p>
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close support options" : "Contact support"}
        className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-gold-light"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-6">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <SupportIcon className="size-6" />
        )}
      </button>
    </div>
  );
}
