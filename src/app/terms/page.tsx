/**
 * NEEDS LEGAL REVIEW BEFORE LAUNCH.
 *
 * Written from the product's actual behaviour rather than from a template, so
 * each clause corresponds to something in the code: the server-issued quote and
 * its expiry (src/lib/actions/convert.ts), the withdrawal minimum and fee
 * (0006 plus src/lib/busha/limits.ts), the 24-hour payout hold after a
 * recipient change (0013), the PIN lockout (0012), suspension (0019).
 *
 * It is NOT advice on whether justpae needs a licence to do any of this in
 * Nigeria, Ghana or Kenya, on which regulator's rules bind it, or on whether
 * these terms are enforceable where the customer lives. A qualified lawyer in
 * each market has to read this, and the licensing question in particular has
 * to be answered before launch rather than by this file.
 */
import { LegalPage, NeedsLegalReview } from "@/components/legal/LegalPage";
import { Analytics } from "@/components/analytics/Analytics";

export const metadata = {
  title: "Terms of Service",
  description: "The agreement between you and justpae.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="13 October 2026">
      <NeedsLegalReview />

      <p>
        These terms are the agreement between you and <strong>Zadok Royal Limited</strong>, which
        operates justpae. By opening an account you accept them. If you do not, do not open one.
      </p>

      <h2>What justpae does</h2>
      <p>
        justpae lets you hold balances in several currencies, move money between them at the rate
        we quote you, withdraw to a bank account, mobile money number or crypto wallet, and pay
        bills where that is available.
      </p>
      <p>
        We are not a bank. Your balance is not a bank deposit and is not covered by any deposit
        protection scheme. We do not pay interest on it and we do not lend it out.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or over and give us accurate information.</li>
        <li>
          One account per person. It is yours alone — do not let anyone else use it, and do not open
          one on someone else&apos;s behalf.
        </li>
        <li>
          Keep your password and your transaction PIN to yourself. Anything done with them is
          treated as done by you, so tell us immediately if you think either is known to someone
          else.
        </li>
        <li>
          Until your identity is verified, you can deposit and convert, but you cannot withdraw.
          This is a legal requirement and not a setting we can turn off for you.
        </li>
      </ul>

      <h2>Rates, fees and quotes</h2>
      <ul>
        <li>
          Every conversion is priced by a <strong>quote we issue</strong>, which shows the rate, our
          spread, both amounts, and how long it is held. Confirm it before it expires and that is
          the rate you get. Let it expire and we price it again — we will not settle at a dead rate.
        </li>
        <li>
          Our margin is the difference between the rate the provider gives us and the rate we quote
          you. It is shown on the quote as a percentage, before you confirm.
        </li>
        <li>
          Withdrawals carry a fee, shown with the amount that will actually arrive before you
          confirm. Deposits, conversions and withdrawals each have a minimum, shown in the currency
          you are using.
        </li>
        <li>
          The rates on the home screen are indicative and refresh while the screen is open. The
          rate that binds is the one on the quote you confirm.
        </li>
      </ul>

      <h2>Moving money</h2>
      <ul>
        <li>
          Some withdrawals go out automatically; above a threshold, or where something needs
          checking, a person reviews them first. The screen tells you which before you confirm.
        </li>
        <li>
          <strong>You are responsible for the destination you give us.</strong> Check it. A payment
          sent to an account number or wallet address you typed wrongly generally cannot be
          recovered — not by us and not by your bank. We will try, and we cannot promise.
        </li>
        <li>
          When you change where your money is paid out, we ask for your password and hold automated
          payouts for 24 hours afterwards, so that someone who has taken over your session cannot
          redirect your money before you notice.
        </li>
        <li>
          Repeated wrong PIN entries lock the PIN for a period and we email you. That is a
          protection, not a fault.
        </li>
        <li>
          A transfer can be delayed or refused by a bank, a mobile money operator or a blockchain
          network. Where that happens we tell you and, where the money has not left, return it to
          your balance.
        </li>
      </ul>

      <h2>What you must not do</h2>
      <ul>
        <li>Use justpae for anything illegal, including money laundering or financing terrorism.</li>
        <li>Move money for someone else, or disguise where money came from or is going.</li>
        <li>Give us false information or someone else&apos;s documents.</li>
        <li>Try to break, overload or probe the service, or work around any limit in it.</li>
      </ul>

      <h2>Suspension and closure</h2>
      <p>
        We may suspend or close an account where we are required to, where we reasonably suspect
        fraud or a breach of these terms, or where we cannot verify who you are. A suspended account
        can sign in and see its balance and history but cannot move money, and we will tell you the
        reason unless the law stops us. Where money is yours and we are not legally required to hold
        it, we will return it.
      </p>
      <p>You can close your account at any time. Withdraw your balance first.</p>

      <h2>Availability</h2>
      <p>
        We try to keep justpae running and we do not promise it will never be unavailable. Providers
        go down, networks congest, and we take the service down to maintain it. Some features are
        marked as not yet available and are exactly that.
      </p>

      <h2>Liability</h2>
      <p>
        Nothing here excludes liability that cannot lawfully be excluded, including for fraud. Other
        than that, we are not liable for loss of profit, loss of opportunity, or indirect loss, and
        our total liability for any claim is limited to the fees you paid us in the twelve months
        before it arose.
      </p>
      <p>We are not responsible for a rate moving, which is the nature of currency.</p>

      <h2>Complaints</h2>
      <p>
        Write to us from the Support screen or email{" "}
        <a href="mailto:support@justpae.com">support@justpae.com</a>. We will acknowledge you and
        tell you what we are doing about it.
      </p>

      <h2>Changes</h2>
      <p>
        We may change these terms. If a change affects you we will email you before it takes effect.
        Continuing to use justpae after that is acceptance; if you would rather not, close your
        account.
      </p>

      <h2>Law</h2>
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria, and its courts have
        jurisdiction — without taking away any protection the law of your own country gives you as a
        consumer.
      </p>
      <Analytics />
    </LegalPage>
  );
}
