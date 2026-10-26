"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput, parseAmount } from "@/components/ui/AmountInput";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { CopyField } from "@/components/ui/CopyButton";
import { CurrencyPicker } from "@/components/ui/CurrencyPicker";
import { depositPickerOptions } from "@/lib/ui/currencyPicker";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { getDepositQuote, initiateDeposit, checkDepositStatus } from "@/lib/actions/deposits";
import type { DepositAvailability } from "@/lib/deposits/availability";
import { fiatMinimumDeposit } from "@/lib/busha/limits";
import { usePolling, isFinalStatus } from "@/lib/hooks/usePolling";
import { useCountdown, formatCountdown } from "@/lib/hooks/useCountdown";
import { formatAmount } from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";
import { type UnavailableKind } from "@/lib/ui/unavailability";
import { LegalReminder } from "@/components/ui/LegalReminder";
import { DepositAddressQr, networkLabel } from "@/components/deposit/DepositAddressQr";
import { MoneyFormLayout, WhatHappensNext } from "@/components/money/MoneyFormLayout";
import { ManualNgnDeposit } from "@/components/deposit/ManualNgnDeposit";
import { NgnAccountNumber } from "@/components/deposit/NgnAccountNumber";
import { DepositSoon } from "@/components/deposit/DepositSoon";
import type { VirtualAccountState } from "@/lib/korapay/virtualAccount";
import type { ManualDepositConfig } from "@/lib/deposits/manualDeposit";
import type { KycStatus } from "@/lib/types/database";

/**
 * GROUP 4f — the heading over the reason, matched to the reason.
 *
 * One title for all states read as "we haven't built this", which is true of
 * none of them: cedi deposits exist and are down, dollars are received
 * rather than deposited, and yuan is bought. `soon` never reaches here — see
 * the dedicated DepositSoon branch below, which has its own one-line copy.
 */
function depositUnavailableTitle(currency: Currency, kind: UnavailableKind): string {
  switch (kind) {
    case "maintenance":
      return `${currency} deposits are coming soon`;
    case "receive":
      return `${currency} arrives by being sent to you`;
    case "convert":
      return `${currency} is bought, not deposited`;
    default:
      return `${currency} deposits aren't available yet`;
  }
}

/**
 * Deposit, in three named steps.
 *
 * THE STEPS ARE LABELLED because the middle one is where money becomes
 * irreversible and the screen used to pass through it without saying so. The
 * quote step is where the provider's fee becomes visible, and the fee is real
 * — a 2,000 naira deposit credits 1,900 after a 100 naira charge. Hiding that
 * until after the money is sent is how a support ticket gets written.
 *
 *   1. How much      amount, with the minimum enforced before any round trip
 *   2. Check it      what you transfer, the fee, what lands
 *   3. Send it       the generated account or address, the exact amount, the
 *                    expiry clock, and the status polling itself
 *
 * Once instructions exist, the screen polls its own status and self-heals. It
 * does not wait for a webhook: for this account the provider's webhook has
 * never delivered, and a platform cron does not run without an external
 * scheduler. A user watching this screen gets credited within one poll cycle
 * regardless.
 */
export function DepositForm({
  wallets,
  availability,
  initialCurrency,
  manualDeposit,
  ngnAccount,
  isAdmin = false,
}: {
  wallets: Wallet[];
  availability: Record<string, DepositAvailability>;
  /**
   * From `?currency=` — see src/lib/accounts/preselect.ts. Already validated
   * and already fallen back, so this component takes it at face value.
   */
  initialCurrency?: Currency;
  /**
   * GROUP 4 — what the naira bank-transfer rail needs, read server-side.
   * Absent in the component gallery, which renders this form with fixtures
   * and no session.
   */
  manualDeposit?: { userId: string; kycStatus: KycStatus; config: ManualDepositConfig };
  /**
   * GROUP 2 — the naira account-number rail, also resolved server-side so
   * the screen never asks the browser which account number to show. Absent
   * when the flag is off and in the component gallery.
   */
  ngnAccount?: { state: VirtualAccountState; depositFee: number };
  /** Display-only, read server-side. Shows the extra line on the "naira
   *  deposits are coming soon" screen that only an operator needs. */
  isAdmin?: boolean;
}) {
  const router = useRouter();

  // GROUP 1d: yuan is gone from this flow entirely — it is bought, not
  // deposited — so the opening currency comes from the same list the picker
  // shows rather than from a wallet that is not in it.
  const pickerOptions = depositPickerOptions(wallets);
  const depositable = pickerOptions.filter((o) => !o.disabled);
  const [currency, setCurrency] = useState<Currency>(() => {
    // `?currency=CNY` is reachable from the yuan account page, and yuan is
    // no longer in this list — opening on a currency the picker cannot show
    // would leave the trigger naming a row that is not there.
    const requested = pickerOptions.some((o) => o.currency === initialCurrency)
      ? initialCurrency
      : undefined;
    return requested ?? depositable[0]?.currency ?? pickerOptions[0]?.currency ?? "NGN";
  });
  const [amountText, setAmountText] = useState("");

  const [quoteState, quoteAction] = useActionState(getDepositQuote, {});
  const [depositState, depositAction] = useActionState(initiateDeposit, {});

  // ONE STEP AT A TIME. Driven by this, not by `quoteState.quoteId` directly:
  // a quote that already exists must not force step 2 back onto the screen
  // the moment "Edit amount" sets this to 1 — only a FRESH quoteId (a new
  // Continue) should advance it. See the render-time check below.
  const [step, setStep] = useState<1 | 2>(1);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(false);

  // Adjusted during render, not in an effect — this IS the pattern React's
  // own docs give for "state that should reset/advance when a value changes,
  // but also needs to be overridable" (https://react.dev/learn/you-might-not-need-an-effect).
  // An effect here would mean committing step 1's render first and only
  // flipping to step 2 a tick later; comparing against the last seen quoteId
  // during render advances it in the very same render a fresh quote arrives in.
  const [lastQuoteId, setLastQuoteId] = useState(quoteState.quoteId);
  if (quoteState.quoteId !== lastQuoteId) {
    setLastQuoteId(quoteState.quoteId);
    if (quoteState.quoteId) setStep(2);
  }

  // Scrolls and moves focus to the new step's heading — but not on the very
  // first render, where the page has just loaded and nothing has "changed"
  // yet from the user's point of view.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    stepHeadingRef.current?.scrollIntoView({ block: "start" });
    stepHeadingRef.current?.focus();
  }, [step]);

  const current = availability[currency];
  const amount = parseAmount(amountText);

  // Mirrored server-side in getDepositQuote AND initiateDeposit, so this is
  // only here to say so before the round trip — it is not the enforcement.
  const minimum = fiatMinimumDeposit(currency);
  const belowMinimum = minimum != null && amount > 0 && amount < minimum;

  useEffect(() => {
    if (depositState.redirectUrl) {
      // The secondary provider's GHS path hands back a hosted payment page.
      window.location.href = depositState.redirectUrl;
    }
  }, [depositState.redirectUrl]);

  // One definition, rendered by the provider path below and handed to the
  // manual naira path — two pickers in one product is two pickers to keep in
  // step.
  const picker = (
    <Card className="space-y-3">
      {/* GROUP 1a. Was a native select whose disabled options rendered three
          different ways across iOS, Android and desktop — see
          CurrencyPicker. The reason a row is shut is still the one
          depositAvailability gives; it is a grey pill now instead of a
          suffix the platform might have truncated away. */}
      <CurrencyPicker
        label="Deposit into"
        title="Deposit into"
        value={currency}
        options={pickerOptions}
        onChange={setCurrency}
      />

      {/* GROUP 2 — "soon" currencies skip this banner: they return their own
          one-line message and "Deposit USDT instead" button below instead of
          saying the same sentence twice. */}
      {current && !current.available && current.kind !== "soon" && (
        // The title names the STATE, not a generic absence. "aren't available
        // yet" was printed over cedis — a rail that exists and is down — and
        // over dollars, which are not deposited at all.
        <Banner tone="info" title={depositUnavailableTitle(currency, current.kind)}>
          {current.reason}
        </Banner>
      )}
    </Card>
  );

  /**
   * GROUP 4 — naira by bank transfer.
   *
   * A whole different rail, not a variant of the provider flow: there is no
   * quote, no generated account, no expiry clock and no status that settles
   * on its own. Branching inside the form below would have meant four
   * conditionals around every step, so it gets its own component and this is
   * the only line that chooses between them.
   */
  if (current?.available && current.provider === "manual" && manualDeposit) {
    return (
      <ManualNgnDeposit
        userId={manualDeposit.userId}
        kycStatus={manualDeposit.kycStatus}
        config={manualDeposit.config}
        picker={picker}
      />
    );
  }

  /**
   * GROUP 2 — naira by permanent account number. The same one-line branch as
   * the manual rail above it and for the same reason: no quote, no amount,
   * no expiry clock and no status to poll means every step below would need
   * a conditional around it.
   */
  if (current?.available && current.provider === "korapay" && ngnAccount) {
    return (
      <NgnAccountNumber
        initial={ngnAccount.state}
        depositFee={ngnAccount.depositFee}
        picker={picker}
      />
    );
  }

  /**
   * GROUP 2 — any currency that is not open yet (no outage to come back
   * from — NGN with both naira flags off, KES with KES_DEPOSIT_ENABLED off).
   * Its own branch for the same reason as the two above: no amount, no
   * quote, nothing the rest of this form does.
   */
  if (current && !current.available && current.kind === "soon") {
    return (
      <DepositSoon
        reason={current.reason}
        picker={picker}
        showAdminNote={isAdmin && currency === "NGN"}
      />
    );
  }

  const instructions = depositState.bankDetails ?? depositState.cryptoAddress;

  if (instructions && depositState.depositId) {
    return (
      <DepositInstructions
        depositId={depositState.depositId}
        currency={currency}
        bankDetails={depositState.bankDetails}
        cryptoAddress={depositState.cryptoAddress}
        // router.refresh() on the way out too, not just on the completion
        // poll: the user may close this screen while the deposit is still
        // pending and have it credited by the webhook or the cron a moment
        // later, and /home would otherwise still be showing the balance from
        // whenever it was first rendered.
        // The quote survives into this screen in this component's own state —
        // nothing clears it — so the fee breakdown can be shown here too. It
        // previously appeared only at the review step and then vanished at
        // exactly the moment the user was about to send real money, which is
        // the moment they most need to see what will actually land.
        grossAmount={quoteState.grossAmount}
        fee={quoteState.fee}
        netAmount={quoteState.netAmount}
        onDone={() => {
          router.refresh();
          router.push("/home");
        }}
      />
    );
  }

  // GROUP 6a — the summary column. The quote card is the same markup rendered
  // inline below under `lg:hidden`; see MoneyFormLayout for why the review
  // step is genuinely in two different places rather than one place styled
  // twice.
  const quoteCard = quoteState.quoteId ? (
    <Card>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Review
      </h2>
      {/* The provider's own quoted source_amount, NOT the typed amount.
          For a percentage-fee currency the two differ — the provider
          grosses the transfer up to cover its fee — and showing the
          typed figure here is what made these three numbers fail to add
          up. See quoteForDesiredNetDeposit in actions/deposits.ts. */}
      <DetailRow label="You transfer">
        {formatAmount(currency, Number(quoteState.grossAmount ?? quoteState.amount ?? 0))}
      </DetailRow>
      <DetailRow label="Deposit fee">
        −{formatAmount(currency, Number(quoteState.fee ?? 0))}
      </DetailRow>
      <DetailRow label="Lands in your wallet">
        <strong>{formatAmount(currency, Number(quoteState.netAmount ?? 0))}</strong>
      </DetailRow>
    </Card>
  ) : null;

  // Declared once and rendered in both columns, so the two cannot drift into
  // saying different things about what the product is about to do.
  const nextSteps = (
    <WhatHappensNext
      steps={[
        "You tell us the amount, and we price it — the fee is the provider's, and it comes off before the money reaches your wallet.",
        current?.available && current.provider === "klasha"
          ? "We hand you a secure payment page for this one deposit."
          : `We generate ${currency === "USDT" ? "a wallet address" : "an account number"} for this one deposit. It expires, and it is never reusable.`,
        "You send exactly the amount shown. The screen credits your wallet itself the moment the money lands — you can leave it open.",
      ]}
      footnote="Nothing leaves your bank until you make the transfer yourself. We never debit you."
    />
  );

  const summary = (
    <>
      {/* Tied to `step`, not to whether a quote merely exists: once "Edit
          amount" sends the user back to step 1, the stale quote from before
          must not keep a "Review" card sitting in the aside for a figure
          that is no longer what is about to be submitted. */}
      {step === 2 && (
        // `hidden lg:block`: the mirror of the inline `lg:hidden` copy below.
        // See MoneyFormLayout — the review belongs above the commit button on
        // a phone and beside it on a desktop.
        <div className="hidden lg:block">{quoteCard}</div>
      )}
      {nextSteps}
    </>
  );

  return (
    <MoneyFormLayout summary={summary}>
    <div className="space-y-4">
      <StepIndicator step={step} total={3} />

      {picker}

      {/* ONE STEP AT A TIME. `step === 1` / `step === 2` are mutually
          exclusive, so there is never more than one primary button and
          never more than one Terms line on screen — see the bug this
          replaced, where both forms rendered together because the amount
          step's visibility never checked whether a quote already existed. */}
      {step === 1 && current?.available && (
        <form action={quoteAction} className="space-y-4">
          <input type="hidden" name="currency" value={currency} />

          <h2 ref={stepHeadingRef} tabIndex={-1} className="text-base font-semibold text-foreground">
            Enter an amount
          </h2>

          <Card>
            <AmountInput
              name="amount"
              label="How much are you sending?"
              currency={currency}
              value={amountText}
              onValueChange={setAmountText}
            />
          </Card>

          {belowMinimum && (
            <Banner tone="info" title={`Minimum ${currency} deposit`}>
              The smallest {currency} deposit we can process is{" "}
              {formatAmount(currency, minimum!)}. Anything less is rejected by the time it
              reaches us.
            </Banner>
          )}

          {quoteState.error && (
            <Banner tone="danger" title="Couldn't price that">
              {quoteState.error}
            </Banner>
          )}

          <SubmitButton disabled={amount <= 0 || belowMinimum} pendingLabel="Checking…">
            Continue
          </SubmitButton>

          {/* GROUP 4g — step 1 of 3. On every step, not just the last one:
              the user should meet this before they have invested anything in
              the flow, not only at the point where backing out is expensive. */}
          <LegalReminder />
        </form>
      )}

      {step === 2 && quoteState.quoteId && (
        <form action={depositAction} className="space-y-4">
          <input type="hidden" name="currency" value={quoteState.currency ?? currency} />
          <input type="hidden" name="quoteId" value={quoteState.quoteId} />
          <input type="hidden" name="amount" value={quoteState.amount ?? ""} />

          <div className="flex items-baseline justify-between gap-3">
            <h2
              ref={stepHeadingRef}
              tabIndex={-1}
              className="text-base font-semibold text-foreground"
            >
              Review your deposit
            </h2>
            {/* Text button, not a second primary action — it goes back to
                step 1 with the typed amount exactly as it was, which is
                still sitting in `amountText` since nothing here clears it. */}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
            >
              Edit amount
            </button>
          </div>

          {/* The review, inline, BELOW 1024px only — on a phone it has to be
              above the button that commits to it. The identical card is in
              the summary column at `lg`. */}
          <div className="lg:hidden">{quoteCard}</div>

          {depositState.error && (
            <Banner tone="danger" title="Couldn't start that deposit">
              {depositState.error}
            </Banner>
          )}

          {/* "Generate", not "get": the next screen's account number does not
              already exist and is not the user's own. It is created for this
              one transfer, and naming the action that way is the first place
              the user is told so. */}
          <SubmitButton pendingLabel="Generating…">Generate account details</SubmitButton>

          {/* GROUP 4g — the review step. This is the one that matters most of
              the three: it is the last screen before the product creates a
              real transfer instruction on the user's behalf. */}
          <LegalReminder />
        </form>
      )}
    </div>
    </MoneyFormLayout>
  );
}

function DepositInstructions({
  depositId,
  currency,
  bankDetails,
  cryptoAddress,
  grossAmount,
  fee,
  netAmount,
  onDone,
}: {
  depositId: string;
  currency: Currency;
  bankDetails?: { accountName: string; accountNumber: string; bankName: string; expiresAt: string };
  cryptoAddress?: { address: string; network: string; expiresAt: string };
  grossAmount?: string;
  fee?: string;
  netAmount?: string;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<
    "pending" | "processing" | "completed" | "failed" | "expired"
  >("pending");
  const router = useRouter();

  // THE COUNTDOWN, and the bug it is written around.
  //
  // useCountdown returns 0 for a missing deadline, exactly as it does for a
  // passed one. Rendering "expired" off that number alone is how the
  // reference implementation ended up telling every user their details had
  // expired the instant they appeared — the provider simply had not sent an
  // expires_at, and absent read as elapsed. So the two cases are separated
  // here: `expiresAt` being present is what makes a clock meaningful at all,
  // and only then does reaching zero mean anything.
  const expiresAt = bankDetails?.expiresAt || cryptoAddress?.expiresAt || "";
  const hasExpiry = expiresAt !== "" && !Number.isNaN(new Date(expiresAt).getTime());
  const secondsLeft = useCountdown(hasExpiry ? expiresAt : undefined);
  // Two independent sources now agree on this, and both are needed.
  //
  // The CLOCK is what the person watching this screen sees: the countdown
  // hits zero in their browser the moment the window closes, with no round
  // trip. The SERVER STATUS (migration 0029, set by the reconciler) is what
  // the person who closed the tab and came back to it sees — their countdown
  // restarted from a deadline that has long since passed, and without this
  // the screen would be showing live-looking transfer details for an account
  // that stopped accepting money days ago.
  const expired = (hasExpiry && secondsLeft === 0) || status === "expired";
  const settled = status === "completed" || status === "failed" || status === "expired";

  // This component only ever mounts AS the transition into step 3 — there is
  // no earlier render of it at a different step to compare against — so
  // unlike DepositForm's step 1/2 toggle, scrolling and focusing here happens
  // unconditionally on mount rather than being skipped the first time.
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    stepHeadingRef.current?.scrollIntoView({ block: "start" });
    stepHeadingRef.current?.focus();
  }, []);

  // Every poll re-checks the provider server-side and credits immediately if
  // funds have landed. Shared with the withdrawal and conversion detail views
  // through usePolling, so all three stop on a final status by the same rule
  // rather than three hand-rolled intervals each remembering to.
  usePolling(
    async () => {
      const result = await checkDepositStatus(depositId);
      // 'awaiting_review' belongs to the manual bank-transfer rail (0036),
      // which has its own screen. A provider deposit cannot reach it.
      if (result.status && result.status !== "awaiting_review") setStatus(result.status);
      if (result.status === "completed") {
        toast.success("Deposit received");
        // THE STALE BALANCE FIX. checkDepositStatus calls revalidatePath on the
        // server, but that only marks the cached data stale — it does not make
        // an already-mounted client tree re-fetch. And a Server Action invoked
        // as a plain function from an interval callback, rather than dispatched
        // through a form or a transition, carries no router update of its own
        // either. So /home kept rendering the balances from the payload it was
        // first given, and the user saw their old balance after being told the
        // money had arrived.
        router.refresh();
      }
      if (result.status === "failed") toast.error("That deposit didn't go through");
    },
    { active: !isFinalStatus(status) },
  );

  return (
    <div className="space-y-4">
      <StepIndicator step={3} total={3} />

      <h2 ref={stepHeadingRef} tabIndex={-1} className="text-base font-semibold text-foreground">
        Send your transfer
      </h2>

      {status === "completed" ? (
        <Banner tone="success" title="Money received">
          Your {currency} wallet has been credited.
        </Banner>
      ) : status === "failed" ? (
        <Banner tone="danger" title="That deposit didn't go through">
          Nothing was taken. You can start again.
        </Banner>
      ) : expired ? (
        // Expiry is not a failure and must not read as one. Nothing has been
        // taken, nothing is owed — the window simply closed, and the only
        // thing the user has to do is ask for fresh details.
        <Banner
          tone="warning"
          title="These details have expired"
          action={{ href: `/deposit?currency=${currency}`, label: "Start a new deposit" }}
        >
          Don&apos;t send anything to them now. Start again and we&apos;ll generate a new
          account for you.
        </Banner>
      ) : (
        <Banner tone="info" title="Waiting for your transfer">
          Send the exact amount shown below. This page updates itself the moment the money
          arrives — you can leave it open.
        </Banner>
      )}

      {/* THE SINGLE MOST EXPENSIVE DEPOSIT MISTAKE is treating these details
          as a standing account and sending to them again next week. They are
          generated per transfer and they die. Said here, in the open, rather
          than as a footnote under the account number. */}
      {!settled && (
        <Banner tone="warning" title="For this one transfer only">
          {cryptoAddress
            ? "This address was created for this deposit and expires. Don't save it or reuse it for a future deposit — generate fresh details each time."
            : "This account was created for this deposit and expires. Don't save it as a beneficiary or send to it again — generate fresh details each time."}
        </Banner>
      )}

      {/* The breakdown, repeated HERE. This is the screen the user is looking
          at while they actually make the transfer, and the amount they must
          send is the provider's grossed-up figure, not what they typed. Showing
          it only at the review step and then hiding it is how a transfer goes
          out for the wrong amount. */}
      {grossAmount && !settled && (
        <Card>
          <div className="pb-3">
            <CopyField
              label={`Send exactly this ${currency} amount`}
              value={Number(grossAmount).toFixed(2)}
            />
          </div>
          <DetailRow label="Deposit fee">−{formatAmount(currency, Number(fee ?? 0))}</DetailRow>
          <DetailRow label="You will receive">
            <strong>{formatAmount(currency, Number(netAmount ?? 0))}</strong>
          </DetailRow>
        </Card>
      )}

      {cryptoAddress && (
        <div className="space-y-2">
          {/* GROUP 4h. Above the address, not below it: the QR is the path
              most people will actually take, and burying it under 42
              characters of hex makes them read the hex first. Hidden once the
              deposit has settled or expired — a live-looking QR for dead
              transfer details is the single most expensive thing this screen
              could show. */}
          {!settled && (
            <DepositAddressQr
              address={cryptoAddress.address}
              network={cryptoAddress.network}
              currency={currency}
            />
          )}
          <CopyField label={`${currency} address`} value={cryptoAddress.address} />
          {/* The warning names the SAME label as the QR tile — "BSC (BEP20)",
              not the raw "BSC" the provider sends — so the two lines a user
              reads side by side cannot look like two different networks. */}
          <Banner tone="warning" title={`Send ${currency} on ${networkLabel(cryptoAddress.network)} only`}>
            Funds sent on any other network, or in any other token, can&apos;t be recovered.
          </Banner>
        </div>
      )}

      {bankDetails && (
        <Card>
          <DetailRow label="Bank">{bankDetails.bankName}</DetailRow>
          <DetailRow label="Account name">{bankDetails.accountName}</DetailRow>
          <DetailRow label="Account number" mono>
            {bankDetails.accountNumber}
          </DetailRow>
          <div className="pt-3">
            <CopyField label="Account number" value={bankDetails.accountNumber} />
          </div>
        </Card>
      )}

      {hasExpiry && !settled && (
        <Card className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {expired ? "Details expired" : "Details expire in"}
          </span>
          <span
            // Announced politely so a screen-reader user hears the expiry
            // once rather than every tick of the clock.
            aria-live={expired ? "polite" : "off"}
            className={`font-mono text-sm font-medium tabular-nums ${
              expired
                ? "text-destructive"
                : secondsLeft <= 60
                  ? "text-primary"
                  : "text-foreground"
            }`}
          >
            {expired ? "—" : formatCountdown(secondsLeft)}
          </span>
        </Card>
      )}

      {hasExpiry && !settled && (
        <p className="text-center text-xs text-muted-foreground">
          Expires {new Date(expiresAt).toLocaleString("en-GB")}
        </p>
      )}

      <Button variant={expired && !settled ? "primary" : "secondary"} fullWidth onClick={onDone}>
        {status === "completed"
          ? "Back to home"
          : expired
            ? "Start again"
            : "I'll finish this later"}
      </Button>

      {/* GROUP 4g — step 3. The deposit has no confirm DIALOG; this screen,
          where the user is about to move real money out of their bank, is its
          equivalent and the place the brief's third instance belongs. Dropped
          once the deposit has settled: nothing is being agreed to any more. */}
      {!settled && <LegalReminder />}
    </div>
  );
}
