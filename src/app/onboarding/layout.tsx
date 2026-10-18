import Link from "next/link";
import { requireSessionUser } from "@/lib/auth/session";
import { Wordmark } from "@/components/layout/Mark";

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
        <Link
          href="/home"
          // -my-2 absorbs the 44px target into the header's existing height.
          className="-my-2 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground"
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
