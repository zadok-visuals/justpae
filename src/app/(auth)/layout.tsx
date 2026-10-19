import Link from "next/link";
import { Wordmark } from "@/components/layout/Mark";
import { PublicSupportButton } from "@/components/support/PublicSupportButton";
import { BACK_BUTTON_CLASS } from "@/lib/ui/escapeControl";

/**
 * The auth shell.
 *
 * min-h-screen-dvh rather than vh: on a phone, a 100vh shell overflows by the
 * height of the URL bar on load, which pushes the submit button below the fold
 * on exactly the screen where it matters most.
 *
 * The support button is here for the case it exists for: someone who cannot
 * sign in. They have an account, they need help, and every route to help in
 * this product is behind the sign-in they are failing.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
        <Wordmark />

        {/* GROUP 5b/5c — a way out of the auth screens, which had none.
            Someone who opened /signup to find out what the product is had the
            browser's Back and nothing else.

            A `<Link href="/">`, NOT the BackButton component, and this is the
            one deliberate exception to "one shared BackButton everywhere".
            router.back() from an auth screen is the loop 5d exists to catch:
            these pages are most often arrived at by REDIRECT — the proxy
            bouncing a signed-out visitor off /home, or logOut() landing them
            here — so the previous history entry is a protected route that
            will redirect straight back to this page, and Back would bounce
            between the two forever.

            logicalParent() already encodes the same rule (every signed-out
            route's parent is "/", never /home) for the deep-link case; this
            applies it unconditionally, because for auth screens the
            "previous entry" is the untrustworthy signal rather than the
            useful one. The look is the shared one. */}
        <Link href="/" className={BACK_BUTTON_CLASS}>
          <span aria-hidden="true">←</span>
          Back to justpae
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      <PublicSupportButton />
    </div>
  );
}
