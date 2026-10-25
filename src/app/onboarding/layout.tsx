import Link from "next/link";
import { requireSessionUser } from "@/lib/auth/session";
import { Wordmark } from "@/components/layout/Mark";
import { BACK_BUTTON_CLASS } from "@/lib/ui/escapeControl";

/**
 * Onboarding sits OUTSIDE the dashboard group: no bottom tab bar, no sidebar.
 *
 * Verification is a focused task, and the tab bar invites abandoning it
 * halfway. There is still a visible way out, because trapping someone in a
 * form is worse than letting them leave and come back — nothing here is
 * mandatory to use the app, only to withdraw.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // Both gates — a session at all, and a confirmed address — in one memoised
  // call shared with every page under this layout. No email in the URL:
  // /auth/verify resolves it from the session or from the pending-email
  // cookie (see resolvePendingVerificationEmail), rather than putting a
  // user's address into history and any referrer.
  await requireSessionUser();

  return (
    <div className="flex min-h-screen-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
        <Wordmark />
        {/* GROUP 5c. This was muted grey text in the top-right corner of a
            form — which is where a user looks when they want out, and the one
            place in this layout where "is that a button?" must not be a
            question. The brand blue, a 44px target, and hover/pressed/focus
            states that match every other escape control in the product. It
            stays a real <Link>, because unlike Back it has one fixed
            destination and middle-clicking it should work. */}
        <Link
          href="/home"
          // -my-2 absorbs the 44px target into the header's existing height.
          className={`-my-2 ${BACK_BUTTON_CLASS}`}
        >
          Later
        </Link>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-6">
        {children}
      </main>
    </div>
  );
}
