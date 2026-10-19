import Link from "next/link";
import { PublicSupportButton } from "@/components/support/PublicSupportButton";
import { Mark } from "@/components/layout/Mark";
import { BACK_BUTTON_CLASS } from "@/lib/ui/escapeControl";

/**
 * The shell both legal pages share: the mark, a title, a last-updated date, the
 * body, and a way back.
 *
 * Signed-out-readable by design — these are the two pages someone reads BEFORE
 * deciding whether to hand over a government ID, so putting either behind sign-in
 * defeats the point of publishing them.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** Shown verbatim. A policy with no date is a policy nobody can rely on. */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" aria-label="justpae home" className="inline-flex min-h-11 items-center gap-2">
            <Mark className="size-7" />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              justpae
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/privacy" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>

        {/* Not @tailwindcss/typography — it isn't a dependency here, and the
            handful of element rules below is less than adding one would be. */}
        <div
          className="
            mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground
            [&_a]:text-primary [&_a]:underline
            [&_h2]:mt-9 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground
            [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground
            [&_li]:mt-1.5
            [&_strong]:font-semibold [&_strong]:text-foreground
            [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5
          "
        >
          {children}
        </div>

        <div className="mt-12 border-t border-border pt-6">
          {/* GROUP 5b/5g — the one place a hard link is the RIGHT answer, and
              the reason it keeps one. Group 4g made every money checkout link
              /terms and /privacy with target="_blank", so a reader on this
              page has very often arrived in a brand-new tab with no history
              at all. router.back() there does nothing — the looping back
              button 5d tests for — and the landing page is the correct
              destination either way. So this stays a `<Link href="/">`,
              styled from the shared escape-control class. */}
          <Link href="/" className={BACK_BUTTON_CLASS}>
            <span aria-hidden="true">←</span>
            Back to justpae
          </Link>
        </div>
      </main>

      {/* Terms and Privacy are where someone goes when they are uneasy about
          something, which is exactly when being unable to find a way to ask
          is worst. */}
      <PublicSupportButton />
    </div>
  );
}

/**
 * The banner every draft carries until a lawyer has read it.
 *
 * Deliberately on the page and not only in a code comment. These were written
 * by looking at what the product actually does — which is the right starting
 * point and is not the same thing as advice about Nigerian, Ghanaian or Kenyan
 * financial-services law, nor about the data-protection regimes in any of
 * them. Shipping an unreviewed policy while implying otherwise is worse than
 * shipping none.
 */
export function NeedsLegalReview() {
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
      <p className="text-sm font-semibold text-foreground">This is a draft awaiting legal review</p>
      <p className="mt-1 text-sm text-muted-foreground">
        It describes what the product actually does today, written by the people who built it. It
        has not been reviewed by a qualified lawyer in any of the countries justpae operates in,
        and it must be before launch.
      </p>
    </div>
  );
}
