import Link from "next/link";

/**
 * GROUP 4g — the one line at the bottom of a money checkout.
 *
 * "By continuing you agree to our Terms & Conditions and Privacy Policy", on
 * every step of a deposit and a withdrawal: the amount step, the review step,
 * and the confirmation dialog.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY BOTH LINKS OPEN IN A NEW TAB, AND WHY THAT IS THE WHOLE POINT
 *
 * These sit under a form the user is part way through. /deposit holds its
 * quote, its amount and (on the last step) live transfer details in CLIENT
 * COMPONENT STATE — see DepositForm — and /withdraw holds an amount and a
 * typed PIN in exactly the same place. None of it is in the URL and none of it
 * is persisted.
 *
 * So a same-tab navigation to /terms does not "lose the page", it destroys
 * work: the quote is gone, the PIN has to be retyped, and on the deposit's
 * final step the generated account details — which expire — are no longer on
 * screen. Coming back with the browser's Back button remounts the tree with
 * empty state. `target="_blank"` with `rel="noopener noreferrer"` is therefore
 * load-bearing here rather than a stylistic choice, and it is why this is a
 * component instead of two inline links somebody could write without it.
 *
 * `noreferrer` as well as `noopener`: these are first-party pages so there is
 * no untrusted opener to worry about, but a referrer header carrying
 * `/deposit?currency=USDT` is a small, free leak with nothing on the other
 * side of it, and the pair is one habit rather than two decisions.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE GOLD IS THE BRAND COLOUR AND ALSO THE AFFORDANCE
 *
 * `text-primary` is justpae's gold. Underlined as well as coloured, because a
 * colour-blind reader on a dark ink background needs the second signal, and
 * because a line of muted grey text with two slightly-less-muted words in it
 * does not read as containing links at all — which is how a legal notice ends
 * up technically present and functionally invisible.
 *
 * A screen-reader user hears "opens in a new tab" from the `sr-only` span, so
 * the window switching underneath them is announced rather than discovered.
 *
 * Server Component on purpose: it is two anchors and a sentence, and it is
 * rendered inside both client and server trees. Nothing here needs the
 * client.
 */
export function LegalReminder({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs leading-relaxed text-muted-foreground ${className}`}>
      By continuing you agree to our <LegalLink href="/terms">Terms &amp; Conditions</LegalLink> and{" "}
      <LegalLink href="/privacy">Privacy Policy</LegalLink>.
    </p>
  );
}

function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </Link>
  );
}
