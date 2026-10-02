import Link from "next/link";
import { Wordmark } from "@/components/layout/Mark";
import { Banner } from "@/components/ui/Primitives";

export const metadata = { title: "Confirm your email" };

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-screen-dvh flex-col bg-background">
      <header className="flex items-center px-5 pb-2 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
        <Wordmark />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm space-y-5">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Confirm your email
          </h1>

          <Banner tone="info" title="We've sent you a link">
            Tap it to finish setting up your account. It works in any browser, so opening it on
            your laptop after signing up on your phone is fine.
          </Banner>

          <p className="text-center text-sm text-muted-foreground">
            Already confirmed?{" "}
            <Link href="/login" className="font-medium text-primary">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
