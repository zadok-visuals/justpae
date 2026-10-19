import { Card } from "@/components/ui/Primitives";

/**
 * GROUP 6a — a money form, with its summary beside it on a wide screen.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THE FORMS NEEDED A DIFFERENT ANSWER FROM THE OTHER PAGES
 *
 * Home, /accounts and /accounts/[currency] split into two columns through
 * PageShell's `aside` slot, because their second column is static content a
 * Server Component already has in hand. The four money forms cannot use that
 * slot, and the reason is structural rather than stylistic: their summary IS
 * their client state. The quote, the rate, the fee, the countdown and what
 * lands in the wallet all live inside DepositForm / ConvertForm /
 * WithdrawForm / PayToChinaForm, change on every keystroke, and a slot
 * rendered by the page above them cannot see any of it.
 *
 * So the split happens INSIDE each form, and this component is the shared
 * grid so that four files cannot drift into four slightly different splits.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE COLUMN WIDTHS, AND WHY THEY ARE NOT EQUAL
 *
 * `minmax(0,34rem) minmax(0,1fr)`. The form is capped at 34rem and does NOT
 * grow — the original max-w-2xl note was right that a label at one edge and
 * its value at the other is unreadable, and that is just as true of a 46rem
 * column as a 90rem one. What was wrong was applying that cap to the page.
 * The summary takes whatever is left, which at 1200px is about 20rem: enough
 * for a row of figures, not enough to tempt anyone into putting a form in it.
 *
 * `lg:sticky lg:top-6` on the summary. These forms get long — a withdrawal
 * with a routing banner, a fee card and a PIN field runs past a 900px
 * viewport — and the figures you are agreeing to should not scroll away from
 * the button that agrees to them.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ON MOBILE THE SUMMARY STACKS UNDER THE FORM — ONCE
 *
 * The aside is an ordinary grid child, so below 1024px it simply follows the
 * form in one column. That matters beyond tidiness: rendering the panel twice
 * (once `lg:hidden` inline, once in the aside) would put two copies of every
 * heading in the document, and a test or a screen reader asking for "Today's
 * rates" would find two of them.
 *
 * THE ONE EXCEPTION is the review card — the fee, the rate, what actually
 * arrives. That genuinely belongs in two different positions rather than one
 * position styled two ways: on a phone it has to come BEFORE the button that
 * commits to it ("Generate account details" above an unread fee is how a
 * transfer goes out for the wrong amount), and on a desktop it belongs beside
 * that button in the sticky column. So each form keeps its review card inline
 * under `lg:hidden` and puts the same node into this slot under
 * `hidden lg:block`. `display: none` removes whichever copy is inactive from
 * the accessibility tree, so each figure is announced once at either size.
 */
export function MoneyFormLayout({
  children,
  summary,
}: {
  children: React.ReactNode;
  /**
   * The amounts, the rate, the fee and what happens next. Null is allowed and
   * expected: before an amount is typed there is nothing to summarise, and a
   * panel of em-dashes is worse than no panel — WhatHappensNext below is what
   * fills the column in that state.
   */
  summary?: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="min-w-0">{children}</div>
      {summary && (
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">{summary}</aside>
      )}
    </div>
  );
}

/**
 * "What happens next", as a numbered list.
 *
 * The brief asks for this by name and it is the half of the summary panel
 * that is useful BEFORE anything has been typed — which is most of the time
 * somebody spends on these screens. It is also the question the product was
 * worst at answering: every one of these four flows ends in a state the user
 * has to wait in, and "your withdrawal is pending" with no indication of
 * whether that means thirty seconds or tomorrow morning is the most common
 * support contact in a payout flow.
 *
 * Written per screen rather than generated, because the honest answer differs
 * for each: a deposit waits on the CUSTOMER to send money, a conversion is
 * instant, a withdrawal may or may not be, and a Pay-to-China payment is
 * reviewed. A generic "we'll process your request" would be the thing this
 * panel exists to replace.
 */
export function WhatHappensNext({
  title = "What happens next",
  steps,
  footnote,
}: {
  title?: string;
  steps: string[];
  footnote?: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2.5 text-sm text-muted-foreground">
            <span className="shrink-0 font-mono text-xs font-semibold text-primary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
      {footnote && <p className="mt-3 text-xs text-muted-foreground">{footnote}</p>}
    </Card>
  );
}
