"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AmountInput, formatAmountInput, parseAmount } from "@/components/ui/AmountInput";
import { PinField } from "@/components/ui/PinField";
import { Button } from "@/components/ui/Button";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { DepositForm } from "@/components/deposit/DepositForm";
import { NewRecipient } from "@/components/settings/RecipientCard";
import { quoteConversion, executeConversion, type ConversionQuote } from "@/lib/actions/convert";
import { requestWithdrawal } from "@/lib/actions/withdrawals";
import { useDebouncedQuote } from "@/lib/hooks/useDebouncedQuote";
import { getMinimumConversionAmount } from "@/lib/busha/limits";
import { formatAmount, formatNumber, formatRate } from "@/lib/currencies";
import type { Wallet, WithdrawalRecipient } from "@/lib/types/database";
import type { DepositAvailability } from "@/lib/deposits/availability";
import type { BushaBank } from "@/lib/busha/client";

/**
 * GROUP 3b — /sell, four steps over two existing server actions.
 *
 * 1. Your USDT       the balance, or the real deposit screen if it's empty.
 * 2. How much        a live quoteConversion(USDT → NGN) preview, same as /convert.
 * 3. Where it goes   the NGN wallet, or a saved/new bank destination.
 * 4. Confirm         one PIN. executeConversion, then — only if a bank was
 *                    picked — requestWithdrawal for exactly what the sale
 *                    delivered. Neither function is reimplemented here.
 *
 * NOTHING NEW MOVES MONEY. Every balance change below is the same RPC chain
 * /convert and /withdraw already call; this file only sequences two existing
 * calls behind one PIN and renders what came back.
 */

type Destination = "wallet" | "bank";

interface SellOutcome {
  error?: string;
  sellTransactionId?: string;
  payoutTransactionId?: string;
  payoutAutomated?: boolean;
  /** Set only when requestWithdrawal itself returned an error — nothing was
   *  debited, so the naira is still sitting in the NGN wallet. */
  payoutError?: string;
}

export function SellForm({
  usdtWallet,
  usdtDepositAvailability,
  recipient,
  banks,
  hasPin,
  kycApproved,
  kycStatus,
  rejectionReason,
}: {
  usdtWallet?: Wallet;
  usdtDepositAvailability: DepositAvailability;
  recipient: WithdrawalRecipient | null;
  banks: BushaBank[];
  hasPin: boolean;
  kycApproved: boolean;
  kycStatus: string | null;
  rejectionReason: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [amountText, setAmountText] = useState("");
  const [destination, setDestination] = useState<Destination>("wallet");
  const [pin, setPin] = useState("");
  const [quote, setQuote] = useState<ConversionQuote | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SellOutcome | null>(null);

  // Read fresh every render rather than copied into state, so a deposit
  // completing elsewhere and refreshing this route (router.refresh(), inside
  // DepositForm's own polling) shows the new balance with no extra plumbing.
  const usdtBalance = usdtWallet?.balance ?? 0;
  const amount = parseAmount(amountText);

  const confirm = useConfirm<{ amount: number; quote: ConversionQuote; destination: Destination }>();

  const { pending: quoting } = useDebouncedQuote({
    key: `${amount}`,
    enabled: step === 2 && amount > 0,
    request: () => quoteConversion({ from: "USDT", to: "NGN", amount, field: "source" }),
    onResult: (result) => {
      setQuote(result.quote ?? null);
      setUnavailable(result.unavailableReason ?? result.error ?? null);
    },
  });

  const insufficient = amount > usdtBalance;
  const minimumSourceAmount = quote?.minimumSourceAmount ?? getMinimumConversionAmount("USDT");
  const belowMinimum = quote?.belowMinimum ?? false;

  async function confirmSell(intent: { amount: number; quote: ConversionQuote; destination: Destination }) {
    setBusy(true);
    setOutcome(null);

    const sellForm = new FormData();
    sellForm.set("from", "USDT");
    sellForm.set("to", "NGN");
    sellForm.set("amount", String(intent.amount));
    sellForm.set("pin", pin);
    const sellResult = await executeConversion({}, sellForm);

    if (sellResult.error || !sellResult.transactionId) {
      setOutcome({ error: sellResult.error ?? "Could not complete that sale." });
      setBusy(false);
      return;
    }

    if (intent.destination === "wallet") {
      setOutcome({ sellTransactionId: sellResult.transactionId });
      setBusy(false);
      router.refresh();
      return;
    }

    // "Send to my bank account" — the exact NGN amount the sale quoted,
    // through the same requestWithdrawal /withdraw calls: PIN, suspension,
    // balance, the automated-payout threshold and the recipient-change hold
    // are all enforced inside it, unchanged.
    const payoutForm = new FormData();
    payoutForm.set("currency", "NGN");
    payoutForm.set("amount", String(intent.quote.targetAmount));
    payoutForm.set("pin", pin);
    const payoutResult = await requestWithdrawal({}, payoutForm);

    setOutcome({
      sellTransactionId: sellResult.transactionId,
      payoutTransactionId: payoutResult.transactionId,
      payoutAutomated: payoutResult.automated,
      payoutError: payoutResult.error,
    });
    setBusy(false);
    router.refresh();
  }

  // ── Status screen — once a sale has actually gone through ───────────────
  if (outcome?.sellTransactionId) {
    return (
      <div className="space-y-4">
        <Banner tone="success" title="Sold">
          {formatAmount("USDT", amount)} converted to{" "}
          {formatAmount("NGN", quote?.targetAmount ?? 0)}.
        </Banner>

        {destination === "bank" &&
          (outcome.payoutError ? (
            <Banner tone="info" title="Your naira is safe in your wallet">
              The payout to your bank didn&apos;t go through: {outcome.payoutError} Nothing was
              lost — the naira from this sale is sitting in your NGN wallet, and you can send it
              from there whenever you&apos;re ready.
            </Banner>
          ) : outcome.payoutAutomated ? (
            <Banner tone="success" title="Paid out">
              It&apos;s on its way to your bank — you&apos;ll get a notification when it lands.
            </Banner>
          ) : (
            <Banner tone="info" title="Paid out — under review">
              A person reviews this one before it leaves. The amount is already held off your
              NGN wallet so it can&apos;t be spent twice.
            </Banner>
          ))}

        {destination === "wallet" && (
          <Banner tone="info" title="In your NGN wallet">
            The naira is in your wallet — convert, withdraw or spend it whenever you like.
          </Banner>
        )}

        <Card>
          <DetailRow label="Sold">{formatAmount("USDT", amount)}</DetailRow>
          <DetailRow label="Received">{formatAmount("NGN", quote?.targetAmount ?? 0)}</DetailRow>
          <DetailRow label="Sale reference" mono>
            {outcome.sellTransactionId}
          </DetailRow>
          {outcome.payoutTransactionId && (
            <DetailRow label="Payout reference" mono>
              {outcome.payoutTransactionId}
            </DetailRow>
          )}
        </Card>

        <Button variant="secondary" fullWidth onClick={() => router.push("/home")}>
          Back to home
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StepIndicator step={step} total={4} />

      {/* ── Step 1 — Your USDT ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Your USDT
            </h2>
            <p className="mt-1 text-2xl text-foreground">{formatAmount("USDT", usdtBalance)}</p>
          </Card>

          {usdtBalance <= 0 && usdtWallet && (
            <>
              <Banner tone="info" title="You don't have any USDT yet">
                Send USDT on BSC (BEP20) only. The balance here updates itself the moment it
                lands.
              </Banner>
              <DepositForm
                wallets={[usdtWallet]}
                availability={{ USDT: usdtDepositAvailability }}
                initialCurrency="USDT"
              />
            </>
          )}

          {usdtBalance <= 0 && !usdtWallet && (
            <Banner tone="danger" title="No USDT wallet on this account">
              Contact support — every account should have one.
            </Banner>
          )}

          {usdtBalance > 0 && (
            <Button fullWidth onClick={() => setStep(2)}>
              Continue
            </Button>
          )}
        </div>
      )}

      {/* ── Step 2 — How much ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <AmountInput
              name="amount"
              label="How much do you want to sell?"
              currency="USDT"
              value={amountText}
              onValueChange={setAmountText}
              max={usdtBalance}
              onMax={() => setAmountText(formatAmountInput(usdtBalance.toFixed(2)))}
              hint={`Balance ${formatAmount("USDT", usdtBalance)}`}
              error={insufficient ? "That's more than your USDT balance." : null}
            />
          </Card>

          {unavailable && (
            <Banner tone="info" title="Can't price that right now">
              {unavailable}
            </Banner>
          )}

          {quote && !quoting && amount > 0 && !insufficient && (
            <Card className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">You get</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatAmount("NGN", quote.targetAmount)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">Sell USDT at</span>
                <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                  {quote.directionRates.sellPrice != null
                    ? `${formatAmount("NGN", quote.directionRates.sellPrice)} per USDT`
                    : "—"}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                <span className="text-sm text-muted-foreground">Rate</span>
                <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                  {formatRate("USDT", "NGN", quote.customerRate)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">Our fee</span>
                <span className="text-sm font-medium text-foreground">
                  {formatNumber(quote.markupRate * 100, 2)}%
                </span>
              </div>
            </Card>
          )}

          {belowMinimum && (
            <Banner tone="warning" title="That's below the minimum">
              Sell at least {formatAmount("USDT", minimumSourceAmount)}.
            </Banner>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              fullWidth
              disabled={!quote || amount <= 0 || insufficient || belowMinimum || quoting}
              onClick={() => setStep(3)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3 — Where should the naira go ─────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Where should the naira go?
            </h2>

            <label className="flex min-h-14 items-center gap-3 rounded-lg border border-border px-3">
              <input
                type="radio"
                name="destination"
                checked={destination === "wallet"}
                onChange={() => setDestination("wallet")}
                className="size-4 accent-primary"
              />
              <span className="text-sm text-foreground">Keep it in my NGN wallet</span>
            </label>

            <label className="flex min-h-14 items-center gap-3 rounded-lg border border-border px-3">
              <input
                type="radio"
                name="destination"
                checked={destination === "bank"}
                onChange={() => setDestination("bank")}
                className="size-4 accent-primary"
              />
              <span className="text-sm text-foreground">Send to my bank account</span>
            </label>
          </Card>

          {destination === "bank" && !kycApproved && (
            <Banner
              tone={kycStatus === "rejected" ? "danger" : "warning"}
              title={
                kycStatus === "rejected"
                  ? "We couldn't verify your details"
                  : "Verify your identity to withdraw"
              }
              action={{
                href: "/onboarding/kyc",
                label: kycStatus === "rejected" ? "Resubmit" : "Continue setting up",
              }}
            >
              {kycStatus === "rejected"
                ? (rejectionReason ?? "Please review your documents and submit them again.")
                : "A payout to your bank needs a verified identity. Keeping the naira in your wallet needs nothing extra."}
            </Banner>
          )}

          {destination === "bank" && kycApproved && (
            <>
              {recipient ? (
                <Card>
                  <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Going to
                  </h2>
                  <DetailRow label="Name">{recipient.account_holder_name}</DetailRow>
                  {recipient.bank_name && <DetailRow label="Bank">{recipient.bank_name}</DetailRow>}
                  {recipient.bank_account_number && (
                    <DetailRow label="Account number" mono>
                      {recipient.bank_account_number}
                    </DetailRow>
                  )}
                </Card>
              ) : (
                <Card className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Add a naira payout account
                  </h2>
                  <NewRecipient currency="NGN" banks={banks} onSaved={() => router.refresh()} />
                </Card>
              )}
            </>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              fullWidth
              disabled={
                destination === "bank" && (!kycApproved || !recipient)
              }
              onClick={() => setStep(4)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4 — Confirm with PIN ───────────────────────────────────── */}
      {step === 4 && quote && (
        <div className="space-y-4">
          <Card>
            <DetailRow label="You sell">{formatAmount("USDT", amount)}</DetailRow>
            <DetailRow label="You get">
              <strong>{formatAmount("NGN", quote.targetAmount)}</strong>
            </DetailRow>
            <DetailRow label="Going to">
              {destination === "wallet" ? "Your NGN wallet" : "Your bank account"}
            </DetailRow>
          </Card>

          {!hasPin && (
            <Banner
              tone="warning"
              title="Set a transaction PIN first"
              action={{ href: "/profile", label: "Set up your PIN" }}
            >
              Every sale is confirmed with a 4-6 digit PIN.
            </Banner>
          )}

          {outcome?.error && (
            <Banner live tone="danger" title="Couldn't complete that sale">
              {outcome.error}
            </Banner>
          )}

          {hasPin && <PinField value={pin} onValueChange={setPin} />}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(3)} disabled={busy}>
              Back
            </Button>
            <Button
              fullWidth
              loading={busy}
              disabled={!hasPin || pin.length < 4}
              onClick={() => confirm.ask({ amount, quote, destination })}
            >
              Sell {formatAmount("USDT", amount)}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Confirm this sale"
        body="Once you confirm, we convert at today's rate and (if you chose a bank) send the naira out."
        rows={
          confirm.intent
            ? [
                { label: "You sell", value: formatAmount("USDT", confirm.intent.amount) },
                {
                  label: "You get",
                  value: formatAmount("NGN", confirm.intent.quote.targetAmount),
                  emphasis: true,
                },
                {
                  label: "Going to",
                  value: confirm.intent.destination === "wallet" ? "Your NGN wallet" : "Your bank account",
                },
              ]
            : undefined
        }
        confirmLabel="Sell"
        cancelLabel="Go back"
        onCancel={confirm.cancel}
        onConfirm={() => confirm.confirm((intent) => confirmSell(intent))}
      />
    </div>
  );
}
