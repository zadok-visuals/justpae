import { Wordmark } from "@/components/layout/Mark";
import { PublicSupportButton } from "@/components/support/PublicSupportButton";

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
      <header className="flex items-center px-5 pb-2 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
        <Wordmark />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      <PublicSupportButton />
    </div>
  );
}
