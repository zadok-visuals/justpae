import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark, Mark } from "@/components/layout/Mark";
import { CURRENCIES } from "@/lib/currencies";
import { BILL_CATEGORIES } from "@/lib/providers/bills";
import { BILLS_ENABLED, USD_COLLECTION_ENABLED } from "@/lib/flags";
import { isWalletLocked } from "@/lib/services";
import { MaintenanceBadge } from "@/components/ui/MaintenanceBadge";
import { Analytics } from "@/components/analytics/Analytics";
import { PublicSupportButton } from "@/components/support/PublicSupportButton";

/**
 * The public landing page.
 *
 * WHAT CHANGED HERE, AND WHY. This route used to be a router: it read the
 * session and redirected to /home or /login, on the reasoning that "there is
 * no marketing site here — this is the product". That holds right up until
 * somebody has to be told what the product IS. A signup form is not an
 * explanation, and sending a first-time visitor straight to a password field
 * asks them to commit before they know what they are committing to.
 *
 * The signed-in case is unchanged: the proxy still sends a session at "/"
 * straight to /home, so this page is only ever rendered for someone who does
 * not have an account. It is therefore fully static — no session read, no
 * database, nothing to make dynamic — which is also the right shape for the
 * one page most likely to be opened on a slow mobile connection.
 *
 * THE COPY RULE, which is not negotiable and is the reason several obvious
 * marketing moves are absent:
 *
 *   NO INVENTED NUMBERS. No user count, no "trusted by", no volume figure, no
 *   uptime percentage, no "rated 4.9". Not one testimonial, because there are
 *   no customers to quote yet and a fabricated quote on a financial product is
 *   a lie told to people about their money. Every concrete claim below is a
 *   feature that exists in this codebase and can be checked against it — the
 *   currency list is imported from src/lib/currencies.ts and the bill
 *   categories from src/lib/providers/bills.ts rather than retyped, so the
 *   page cannot drift into claiming something the product does not do.
 *
 *   NO PROVIDER NAMES. Who settles a payout is backend detail. Naming an
 *   upstream in customer-facing copy is both meaningless to the reader and a
 *   ready-made phishing pretext.
 *
 * What replaces the fake social proof is specificity. "Change your payout
 * account and the next withdrawal to it is reviewed by a person for 24 hours"
 * is a real, checkable, unusual commitment; "bank-grade security" is noise
 * that every competitor also prints.
 *
 * FLAG-GATED CLAIMS. Three features ship default-off pending a provider (see
 * src/lib/flags.ts): bills, USD collection, and GHS deposit. The sections
 * below that describe the first two are rendered ONLY when their flag is on.
 *
 * This is the same copy rule applied one level deeper, and it is the easy
 * mistake to make here: a bills section is not a lie about a feature that does
 * not exist — the UI, the schema and the server action are all built — but it
 * IS a promise to a visitor who would sign up, tap Bills, and find "coming
 * soon". Someone who opened an account to pay their electricity bill has been
 * mis-sold even though every individual sentence was true. Reading the flags
 * here means the page starts advertising each one on the day its provider
 * lands, with no copy change and no risk of having forgotten.
 *
 * THE TWO LOCKED WALLETS, USD and GHS, are handled DIFFERENTLY. Hiding them
 * would be worse than showing them — it would say the product does not do
 * dollars or cedis, which is false and permanent. So both stay in the wallet
 * rail, last, carrying the Maintenance badge, read from isWalletLocked rather
 * than from a deposit rail: a reader sees the state before they hand over a
 * government ID, not after. The same treatment Bills and Flights got inside
 * the app, applied to the page where somebody is still deciding.
 */

const TITLE = "JustPae — hold, convert and send money across borders";

// Subject to the same flag rule as the page body: a search result or a shared
// link that promises bill payments is the first thing a visitor reads, and it
// would be the one piece of copy still over-promising after the sections were
// correctly gated.
const DESCRIPTION = [
  // GROUP 2e — no dollars and no cedis. Both wallets are locked today, and
  // this string is the first thing a search result shows.
  "Hold naira, shillings, USDT and more in one account.",
  "Convert at a rate you see before you confirm,",
  BILLS_ENABLED ? "pay bills," : "",
  "and withdraw to a bank, mobile money or a wallet.",
]
  .filter(Boolean)
  .join(" ");

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
};

function SignInLinks({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed"
      >
        {compact ? "Open an account" : "Create an account"}
      </Link>
    </div>
  );
}

/** A labelled claim. `detail` is where the specificity lives — the headline is
 *  the promise, the detail is the thing a competitor's page would not print. */
function Feature({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen-dvh bg-background">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="JustPae Home" className="inline-flex min-h-11 items-center">
            <Wordmark />
          </Link>
          <SignInLinks compact />
        </div>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
          <div className="max-w-2xl">
            {/* A flat rail in the brand blue — no gradient, no gold. */}
            <div className="mb-6 h-px w-16 bg-primary" />

            <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
              Money that moves between{" "}
              <span className="text-primary">the currencies you actually use</span>.
            </h1>

            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              One account that holds your local currency alongside USDT. Convert between them at
              a rate you see before you confirm
              {BILLS_ENABLED ? ", pay your bills," : ","} and send money out to a bank, mobile
              money or a crypto wallet.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed"
              >
                Open an account
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-14 items-center justify-center rounded-lg border border-border bg-secondary px-6 text-base font-medium text-foreground hover:bg-accent"
              >
                I already have one
              </Link>
            </div>

            {/* Honest, and load-bearing: someone in a country with no local
                wallet should find that out here rather than after handing over
                their identity documents. */}
            <p className="mt-4 text-sm text-muted-foreground">
              Free to open. Identity verification is required before you can withdraw.
            </p>
          </div>

          {/* ── The currency rail ───────────────────────────────────────── */}
          {/* Mapped from CURRENCIES, so this cannot list a currency the
              product does not actually support. */}
          <div className="mt-14 border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Wallets you get
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {CURRENCIES.map((currency) => {
                // GROUP 2e — the WALLET's own state, not its deposit rail's.
                // depositAvailability put the badge on GHS and not on USD,
                // because dollars have no deposit rail to be "under
                // maintenance" — they arrive by /receive, which is itself off.
                // So the rail said cedis were down and dollars were fine,
                // when neither wallet can be used today. isWalletLocked is
                // the question this section is actually asking.
                const underMaintenance = isWalletLocked(currency.code);
                return (
                  <li
                    key={currency.code}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2"
                  >
                    <span aria-hidden="true" className="text-base leading-none">
                      {currency.flag}
                    </span>
                    <span className="font-mono text-sm font-medium text-foreground">
                      {currency.code}
                    </span>
                    <span className="text-sm text-muted-foreground">{currency.label}</span>
                    {/* GROUP 4f — the badge reaches the page a visitor decides
                        on, which is the only place it can still change their
                        mind cheaply. Somebody reads "GHS · Ghana Cedi", opens
                        an account, hands over a government ID, and THEN meets
                        the maintenance screen; saying it here costs a signup
                        we would have lost anyway.

                        Derived from the wallet flags rather than hard-coded,
                        so a badge disappears on the day its wallet comes back
                        with no copy change here. */}
                    {underMaintenance && <MaintenanceBadge />}
                  </li>
                );
              })}
            </ul>
            {/* One line, not three. The two it replaced promised a dollar
                wallet to everyone and a Ghanaian local one, both of which are
                sitting behind the Maintenance pill directly above. */}
            <p className="mt-3 text-sm text-muted-foreground">
              Your local wallet is added for Nigeria and Kenya. More currencies are coming.
            </p>
          </div>
        </section>

        {/* ── What you can do ───────────────────────────────────────────── */}
        {/* GROUP 9. Was bg-ink-light/40, a fixed near-black wash — correct
            as a subtle band on the dark theme, a dark smear across a light
            page. bg-muted/60 is themed, giving the same "the section behind
            this one" separation in both. */}
        <section className="border-y border-border bg-muted/60">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              What you can do with it
            </h2>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Feature title="Hold your local currency and USDT">
                Keep a balance in each, side by side, and move between them when the rate suits you
                — not when a transfer forces you to.
              </Feature>

              <Feature title="Convert at the rate you were shown">
                You see the rate and the amount you&apos;ll receive before you confirm, and that is
                the rate the conversion settles at. The full breakdown stays on the transaction
                afterwards, so you can check it.
              </Feature>

              {USD_COLLECTION_ENABLED && (
                <Feature title="Get paid in dollars">
                  Receive dollars into an account detail of your own and convert them when you need
                  to.
                </Feature>
              )}

              <Feature title="Send money out">
                Withdraw to a bank account, to mobile money, or to a crypto wallet address — from
                whichever of your wallets has the funds.
              </Feature>
            </div>

            {/* Bills get their own band, built from BILL_CATEGORIES — the same
                list the product's own Bills screen renders — and shown only
                when the feature is actually switched on. See the flag note in
                this file's header. */}
            {BILLS_ENABLED && (
              <div className="mt-6 rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-lg font-semibold text-foreground">
                  And pay the bills while you&apos;re there
                </h3>
                <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                  {BILL_CATEGORIES.map((category) => (
                    <li key={category.value}>
                      <p className="text-sm font-medium text-foreground">{category.label}</p>
                      <p className="text-sm text-muted-foreground">{category.blurb}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Getting started
          </h2>

          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Open the account",
                body: "An email address and a password. Your wallets are created straight away and you can start depositing.",
              },
              {
                step: "02",
                title: "Verify who you are",
                body: "A photo of your ID and a selfie, from your phone. This is required before your first withdrawal, and it is the law rather than our preference.",
              },
              {
                step: "03",
                title: "Move your money",
                body: `Deposit, convert${
                  BILLS_ENABLED ? ", pay a bill" : ""
                } or withdraw. Set a transaction PIN once and it guards everything that sends money out.`,
              },
            ].map((item) => (
              <li key={item.step}>
                <span className="font-mono text-sm font-semibold text-primary">{item.step}</span>
                <h3 className="mt-2 font-display text-lg font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Security, stated specifically ─────────────────────────────── */}
        <section className="border-y border-border bg-muted/60">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
                The parts that protect you
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Written out specifically, because &ldquo;bank-grade security&rdquo; is a phrase that
                commits to nothing. These are things you can check for yourself once you have an
                account.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Feature title="A PIN on everything outbound">
                A separate transaction PIN is required for every withdrawal and conversion
                {BILLS_ENABLED ? ", and every bill payment" : ""}. Too many wrong attempts locks it
                for a while, and we email you the moment it locks — so you find out if someone else
                is guessing.
              </Feature>

              <Feature title="Changing your payout account is slowed down on purpose">
                Replace the bank account or wallet you withdraw to and we email you about it, then
                hold withdrawals to the new destination for review by a person for the next 24
                hours. If it wasn&apos;t you, that window is when it gets stopped.
              </Feature>

              <Feature title="You hear about money moving">
                A deposit landing, a conversion settling, a withdrawal going out or coming back —
                each one is an email and a notification in the app, not something you discover by
                checking your balance.
              </Feature>

              <Feature title="A withdrawal that fails gives the money back">
                If a payout doesn&apos;t go through, the amount goes straight back into your wallet
                and we tell you why. Nothing sits in limbo waiting for someone to notice.
              </Feature>
            </div>
          </div>
        </section>

        {/* ── Support, because it is a real differentiator and free to say ── */}
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-10">
            <div className="max-w-xl">
              <h2 className="font-display text-2xl font-semibold text-foreground">
                If something goes wrong, you talk to us
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Support is a single thread inside the app, with a person on the other end. Send a
                screenshot if it helps. We answer in the same thread and email you when we do, so
                you don&apos;t have to sit and watch it.
              </p>
            </div>
          </div>
        </section>

        {/* ── Closing CTA ───────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
                  Open an account
                </h2>
                <p className="mt-2 text-base text-muted-foreground">
                  It takes an email address. Verification comes later, before your first
                  withdrawal.
                </p>
              </div>
              <SignInLinks />
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <Mark className="size-7" />
            <span className="text-sm text-muted-foreground">
              {/* Same entity line as the transactional emails, so the name a
                  customer sees in their inbox matches the one on the site. */}
              justpae &middot; Zadok Royal Limited
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link href="/login" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Link href="/signup" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">
              Create an account
            </Link>
            {/* A money product that asks for a government ID has to publish
                both of these and link them from the page where someone decides
                to sign up. */}
            <Link href="/privacy" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>

      {/* Reaching a human without an account. Deliberately not the in-app
          chat, which is per-account and has no row to write — see the
          component. */}
      <PublicSupportButton />

      {/* Public pages only — never the dashboard layout. See Analytics. */}
      <Analytics />
    </div>
  );
}
