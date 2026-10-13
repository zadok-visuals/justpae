/**
 * NEEDS LEGAL REVIEW BEFORE LAUNCH.
 *
 * This draft was written by reading the schema and the server actions, so every
 * claim in it is checkable against the code: the KYC columns in migration 0001,
 * the private `kyc-documents` bucket, `admin_activity_log` in 0019, the Resend
 * and Busha/Klasha calls in src/lib. Nothing here is boilerplate copied from
 * another company's policy, and nothing describes a practice this app does not
 * actually have.
 *
 * What it is NOT is advice about the NDPA (Nigeria), the Data Protection Act
 * (Ghana) or the Data Protection Act (Kenya), the registration each may
 * require, or the lawful basis and retention periods a regulator would expect
 * to see named. A qualified lawyer in each market has to read this.
 *
 * The on-page banner says the same thing, deliberately — a comment nobody
 * outside the repo can see is not a disclosure.
 */
import { LegalPage, NeedsLegalReview } from "@/components/legal/LegalPage";
import { Analytics } from "@/components/analytics/Analytics";

export const metadata = {
  title: "Privacy Policy",
  description: "What justpae collects, why, who sees it, and how to get it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="13 October 2026">
      <NeedsLegalReview />

      <p>
        justpae is operated by <strong>Zadok Royal Limited</strong>. This policy explains what we
        collect, why we have to, who else sees it, and what you can ask us to do with it. It covers
        the justpae app and website.
      </p>

      <h2>What we collect</h2>

      <h3>What you give us</h3>
      <ul>
        <li>
          <strong>Your account.</strong> Email address and password. The password is never stored
          by us in a readable form — authentication is handled by Supabase, which stores a hash.
        </li>
        <li>
          <strong>Your identity.</strong> Full name, phone number, country, date of birth, address,
          and a government identity number — a BVN or NIN in Nigeria, or the national ID or
          passport number you choose elsewhere. For a business account: the registered name, tax
          identification number, and ownership details.
        </li>
        <li>
          <strong>Documents.</strong> Photographs or scans of your identity document, proof of
          address, and for a business, the registration certificate and a director&apos;s ID.
        </li>
        <li>
          <strong>Where your money goes.</strong> Bank account, mobile money number or wallet
          address, and the name on it.
        </li>
        <li>
          <strong>What you write to us.</strong> Support messages and anything attached to them.
        </li>
      </ul>

      <h3>What using the service produces</h3>
      <ul>
        <li>
          <strong>Transactions.</strong> Deposits, conversions, withdrawals and bill payments —
          amounts, currencies, rates, fees, status and timestamps.
        </li>
        <li>
          <strong>Security records.</strong> Sign-ins, failed transaction-PIN attempts and the
          resulting lockouts, and changes to your payout destination.
        </li>
      </ul>

      <h3>What we deliberately do not collect</h3>
      <ul>
        <li>
          We do not collect your <strong>transaction PIN</strong> in a readable form. It is hashed,
          and the hash cannot be read back by any application query.
        </li>
        <li>
          We do not use <strong>advertising or cross-site tracking cookies</strong>, and we do not
          sell or rent your information to anyone, for any purpose.
        </li>
        <li>
          Analytics, where enabled, runs only on the public pages — never on any screen behind
          sign-in. It is disabled entirely unless an analytics ID is configured.
        </li>
      </ul>

      <h2>Why we collect it</h2>
      <ul>
        <li>
          <strong>To run your account</strong> — holding balances, converting between currencies,
          paying out to your destination, and paying bills.
        </li>
        <li>
          <strong>Because the law requires it.</strong> Identity verification, sanctions and
          anti-money-laundering obligations apply to a business that moves money. We cannot waive
          them, which is why withdrawals stay closed until verification is approved.
        </li>
        <li>
          <strong>To stop fraud.</strong> This is why a change of payout destination requires your
          password and is held back from automated payout for 24 hours, and why repeated wrong PINs
          lock the PIN and email you.
        </li>
        <li>
          <strong>To support you</strong>, and to tell you about things that happen to your money.
        </li>
      </ul>

      <h2>Who else sees it</h2>
      <p>
        Only the parties below, and only what each needs. None of them receives your information
        for their own marketing.
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — our database, authentication and file storage. Identity
          documents are held in a private bucket that is not publicly readable; links to them are
          signed, short-lived, and issued only to a reviewer.
        </li>
        <li>
          <strong>Payment and conversion providers</strong> — currently Busha, and Klasha for Ghanaian
          collections. They receive what a transfer requires: amount, currency, and the destination
          account and the name on it.
        </li>
        <li>
          <strong>Resend</strong> — sends our transactional email. It receives your email address
          and the content of the message.
        </li>
        <li>
          <strong>Our own staff</strong>, where a decision needs a person: reviewing a verification,
          releasing a payout, answering support. Every such action, including opening a customer&apos;s
          identity document, is written to an audit log that cannot be edited or deleted by anyone,
          including us.
        </li>
        <li>
          <strong>Regulators, law enforcement and auditors</strong>, where we are legally required
          to produce records.
        </li>
      </ul>

      <h2>Where it is held, and for how long</h2>
      <p>
        Data is held on infrastructure that may be located outside your country, including in the
        European Union and the United States. Transfers are encrypted in transit.
      </p>
      <p>
        Financial and identity records are kept for as long as anti-money-laundering law requires
        after your account closes — commonly five to seven years, depending on the country — and
        are then deleted. Support messages and their attachments are kept while they remain
        relevant to your account. Closing your account does not delete records we are required to
        retain, and we will say so plainly rather than claim otherwise.
      </p>

      <h2>Your rights</h2>
      <p>
        Subject to the retention obligations above, you can ask us to show you what we hold about
        you, correct anything wrong, delete what we are not required to keep, or send you a copy in
        a portable format. You can object to a use you disagree with, and you can complain to the
        data-protection authority in your country.
      </p>
      <p>
        Some information you cannot change yourself, on purpose: once a verification is submitted,
        your name, date of birth and identity number are locked so that an approved identity cannot
        be quietly swapped for another one. Ask us, and we will correct a genuine error.
      </p>

      <h2>Keeping it safe</h2>
      <ul>
        <li>Everything travels over HTTPS, and the app refuses to be embedded in another site.</li>
        <li>
          Access to your rows is enforced by the database itself, not only by the app — a query for
          someone else&apos;s data returns nothing, rather than relying on the application to remember
          to filter.
        </li>
        <li>
          Staff access to the admin tools requires a second factor, not just a password, and every
          action is logged.
        </li>
        <li>
          Money-moving actions need your transaction PIN; changing that PIN, or where your money is
          paid out, needs your account password as well.
        </li>
      </ul>
      <p>
        No system is perfectly secure. If a breach affects you, we will tell you and the relevant
        authority, and we will say what actually happened.
      </p>

      <h2>Children</h2>
      <p>
        justpae is not for anyone under 18. We do not knowingly open accounts for children, and we
        will close one and delete its data if we find we have.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy in a way that affects you, we will email you before it takes
        effect rather than relying on you to re-read this page.
      </p>

      <h2>Contact</h2>
      <p>
        Write to us from the Support screen in the app, or email{" "}
        <a href="mailto:privacy@justpae.com">privacy@justpae.com</a>.
      </p>
      <Analytics />
    </LegalPage>
  );
}
