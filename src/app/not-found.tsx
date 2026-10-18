import Link from "next/link";
import { Card } from "@/components/ui/Primitives";
import { Wordmark } from "@/components/layout/Mark";

/**
 * The 404.
 *
 * It did not exist before, for a reason that was not obvious: the proxy
 * redirected every unrecognised path to /login, so nothing ever reached Next's
 * router to be missed, and the framework's bare default page was unreachable
 * in practice. Scoping that redirect to routes this app actually defines (see
 * src/lib/routes/access.ts) makes genuine 404s real again — and an unstyled
 * framework 404 in a product people trust with money reads like the service
 * has fallen over.
 *
 * Deliberately a server component with no session read: this renders for
 * crawlers and for signed-out strangers as often as for customers, and the
 * link out goes to the public landing page, which redirects a signed-in user
 * to /home on its own.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm space-y-5 text-center">
        <Wordmark className="justify-center" />

        <div className="space-y-2">
          <p className="font-mono text-xs tracking-widest text-gold">404</p>
          <h1 className="font-display text-xl font-semibold text-foreground">
            That page isn&apos;t here
          </h1>
          <p className="text-sm text-muted-foreground">
            The link may be out of date, or the address mistyped. Nothing is wrong with your
            account.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-gold-light"
        >
          Go to justpae
        </Link>

        <p className="text-xs text-muted-foreground">
          Need a hand?{" "}
          <a href="mailto:support@justpae.com" className="font-medium text-gold hover:underline">
            support@justpae.com
          </a>
        </p>
      </Card>
    </div>
  );
}
