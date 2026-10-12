"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { Wordmark } from "@/components/layout/Mark";

/**
 * Route-level error boundary. Everything below the root layout renders through
 * this when an unhandled error escapes.
 *
 * WHY IT WAS ADDED. There wasn't one, so every unhandled error — including the
 * server-action body-size rejection that broke KYC uploads for anyone using a
 * phone camera (see src/lib/storage/clientUpload.ts) — surfaced as the
 * framework's own bare "something went wrong" page. In a product people trust
 * with money, an unstyled framework error page is worse than the bug that
 * caused it: it looks like the whole service has fallen over, and it offers
 * nothing to do next.
 *
 * `unstable_retry` rather than `reset`: in Next 16 retry re-fetches and
 * re-renders the boundary's children, where reset only clears the error state
 * and re-renders with the same data. For a transient failure — which is most of
 * them — re-fetching is the one that actually recovers.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // In production the message is stripped before it reaches the client and
    // only `digest` survives, which is the handle for finding it in the server
    // logs. Logging both is what makes a user's screenshot actionable.
    console.error("[error boundary]", error.digest, error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm space-y-5 text-center">
        <Wordmark className="justify-center" />

        <div className="space-y-2">
          <h1 className="font-display text-xl font-semibold text-foreground">
            That didn&apos;t load
          </h1>
          <p className="text-sm text-muted-foreground">
            Something went wrong on our side. Your money and your balances are untouched — this
            is only this screen.
          </p>
        </div>

        <Button fullWidth onClick={() => unstable_retry()}>
          Try again
        </Button>

        <p className="text-xs text-muted-foreground">
          Still stuck?{" "}
          <a href="mailto:support@justpae.com" className="font-medium text-gold hover:underline">
            support@justpae.com
          </a>
          {error.digest && (
            <>
              <br />
              <span className="font-mono text-[11px]">Reference {error.digest}</span>
            </>
          )}
        </p>
      </Card>
    </div>
  );
}
