"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AmountInput, parseAmount } from "@/components/ui/AmountInput";
import { PinField } from "@/components/ui/PinField";
import { Button } from "@/components/ui/Button";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { CurrencyPicker } from "@/components/ui/CurrencyPicker";
import { CopyField } from "@/components/ui/CopyButton";
import { DepositAddressQr, networkLabel } from "@/components/deposit/DepositAddressQr";
import { sellTargetPickerOptions } from "@/lib/ui/currencyPicker";
import { quoteConversion, type ConversionQuote } from "@/lib/actions/convert";
import { beginSellOrder, pollSellOrder, type SellOrderView } from "@/lib/actions/sellOrders";
import { useDebouncedQuote } from "@/lib/hooks/useDebouncedQuote";
import { usePolling } from "@/lib/hooks/usePolling";
import { useCountdown, formatCountdown } from "@/lib/hooks/useCountdown";
import { getMinimumConversionAmount } from "@/lib/busha/limits";
import { formatAmount, formatNumber, formatRate } from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";

/**
 * GROUP — sell orders (migration 0046). USDT in, fiat credited to the
 * customer's OWN wallet, never a bank. The three steps:
 *
 *   1. amount    how much USDT, which fiat wallet it lands in, a live quote.
 *   2. confirm   the one PIN that authorises the whole order — everything
 *                after this runs unattended, from a webhook or a cron.
 *   3. status    send the USDT; a timeline that advances itself as the
 *                deposit lands and the automated sale runs.
 *
 * Nothing here moves money directly — beginSellOrder creates the order and
 * starts the existing USDT deposit flow; everything after that is
 * src/lib/sellOrders/settle.ts, triggered by the deposit actually landing.
 */

const POLL_INTERVAL_MS = 5000;

function isSellOrderFinal(status: SellOrderView["status"]): boolean {
  return status === "sold" || status === "credited_usdt" || status === "expired" || status === "failed";
}

export function SellForm({ wallets, hasPin }: { wallets: Wallet[]; hasPin: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"amount" | "confirm" | "status">("amount");

  const usdtWallet = wallets.find((w) => w.currency === "USDT");
  const usdtBalance = usdtWallet?.balance ?? 0;
  const pickerOptions = sellTargetPickerOptions(wallets);

  const [amountText, setAmountText] = useState("");
  const [targetCurrency, setTargetCurrency] = useState<Currency>(
    () => pickerOptions.find((o) => !o.disabled)?.currency ?? "NGN",
  );
  const [pin, setPin] = useState("");
  const [quote, setQuote] = useState<ConversionQuote | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [beginError, setBeginError] = useState<string | null>(null);

  const [sellOrderId, setSellOrderId] = useState<string | null>(null);
  const [cryptoAddress, setCryptoAddress] = useState<
    { address: string; network: string; expiresAt: string } | undefined
  >(undefined);
  const [order, setOrder] = useState<SellOrderView | null>(null);

  const amount = parseAmount(amountText);
  const minimum = getMinimumConversionAmount("USDT");
  const belowMinimum = amount > 0 && amount < minimum;

  const { pending: quoting } = useDebouncedQuote({
    key: `${amount}|${targetCurrency}`,
    enabled: step === "amount" && amount > 0 && !belowMinimum,
    request: () => quoteConversion({ from: "USDT", to: targetCurrency, amount, field: "source" }),
    onResult: (result) => {
      setQuote(result.quote ?? null);
      setUnavailable(result.unavailableReason ?? result.error ?? null);
    },
  });

  const confirm = useConfirm<{ amount: number; targetCurrency: Currency; quote: ConversionQuote }>();

  usePolling(
    async () => {
      if (!sellOrderId) return;
      const fresh = await pollSellOrder(sellOrderId);
      if (fresh) setOrder(fresh);
    },
    { active: step === "status" && order != null && !isSellOrderFinal(order.status), intervalMs: POLL_INTERVAL_MS },
  );

  async function handleConfirm(intent: { amount: number; targetCurrency: Currency }) {
    setBusy(true);
    setBeginError(null);

    const form = new FormData();
    form.set("amount", String(intent.amount));
    form.set("targetCurrency", intent.targetCurrency);
    form.set("pin", pin);
    const result = await beginSellOrder({}, form);
    setBusy(false);

    if (!result.sellOrderId) {
      setBeginError(result.error ?? "Could not start that sale.");
      return;
    }

    setSellOrderId(result.sellOrderId);
    setCryptoAddress(result.cryptoAddress);
    // The order is 'awaiting_deposit' the instant it exists — no need to
    // wait for the first poll to show the send screen.
    pollSellOrder(result.sellOrderId).then((fresh) => {
      if (fresh) setOrder(fresh);
    });
    setStep("status");

    if (result.error) setBeginError(result.error);
  }

  // ── Step 3 — status ──────────────────────────────────────────────────────
  if (step === "status") {
    return (
      <SellOrderStatus
        order={order}
        cryptoAddress={cryptoAddress}
        fallbackAmount={amount}
        fallbackTargetCurrency={targetCurrency}
        beginError={beginError}
        onDone={() => router.push("/home")}
      />
    );
  }

  // ── Step 2 — confirm with the transaction PIN ───────────────────────────
  if (step === "confirm" && quote) {
    return (
      <div className="space-y-4">
        <StepIndicator step={2} total={2} />

        <Card>
          <DetailRow label="You sell">{formatAmount("USDT", amount)}</DetailRow>
          <DetailRow label="You'll get about">
            <strong>{formatAmount(targetCurrency, quote.targetAmount)}</strong>
          </DetailRow>
          <DetailRow label="Goes to">Your {targetCurrency} wallet</DetailRow>
        </Card>

        <Banner tone="info" title="Final amount uses the rate when your USDT arrives">
          It goes to your {targetCurrency} wallet — you withdraw it from there, whenever
          you&apos;re ready.
        </Banner>

        {!hasPin && (
          <Banner
            tone="warning"
            title="Set a transaction PIN first"
            action={{ href: "/profile", label: "Set up your PIN" }}
          >
            Every sale is confirmed with a 4-6 digit PIN.
          </Banner>
        )}

        {beginError && (
          <Banner live tone="danger" title="Couldn't start that sale">
            {beginError}
          </Banner>
        )}

        {hasPin && <PinField value={pin} onValueChange={setPin} />}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setStep("amount")} disabled={busy}>
            Back
          </Button>
          <Button
            fullWidth
            loading={busy}
            disabled={!hasPin || pin.length < 4}
            onClick={() => confirm.ask({ amount, targetCurrency, quote })}
          >
            Sell {formatAmount("USDT", amount)}
          </Button>
        </div>

        <ConfirmDialog
          open={confirm.open}
          title="Confirm this sale"
          body="Once you confirm, we start the USDT deposit for this sale. The final amount is priced when it actually arrives."
          rows={
            confirm.intent
              ? [
                  { label: "You sell", value: formatAmount("USDT", confirm.intent.amount) },
                  {
                    label: "You'll get about",
                    value: formatAmount(confirm.intent.targetCurrency, confirm.intent.quote.targetAmount),
                    emphasis: true,
                  },
                  { label: "Goes to", value: `Your ${confirm.intent.targetCurrency} wallet` },
                ]
              : undefined
          }
          confirmLabel="Sell"
          cancelLabel="Go back"
          onCancel={confirm.cancel}
          onConfirm={() => confirm.confirm((intent) => handleConfirm(intent))}
        />
      </div>
    );
  }

  // ── Step 1 — Sell your USDT ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <StepIndicator step={1} total={2} />

      <Card className="space-y-3">
        <AmountInput
          name="amount"
          label="How much USDT do you want to sell?"
          currency="USDT"
          value={amountText}
          onValueChange={setAmountText}
          hint={usdtBalance > 0 ? `Already holding ${formatAmount("USDT", usdtBalance)}?` : undefined}
          error={null}
        />

        <CurrencyPicker
          label="Receive in"
          title="Receive in"
          value={targetCurrency}
          options={pickerOptions}
          onChange={setTargetCurrency}
        />
      </Card>

      {belowMinimum && (
        <Banner tone="warning" title="That's below the minimum">
          Sell at least {formatAmount("USDT", minimum)}.
        </Banner>
      )}

      {unavailable && (
        <Banner tone="info" title="Can't price that right now">
          {unavailable}
        </Banner>
      )}

      {quote && !quoting && amount > 0 && !belowMinimum && (
        <Card className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">You&apos;ll get about</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {formatAmount(targetCurrency, quote.targetAmount)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">Sell USDT at</span>
            <span className="font-mono text-sm font-medium tabular-nums text-foreground">
              {quote.directionRates.sellPrice != null
                ? `${formatAmount(targetCurrency, quote.directionRates.sellPrice)} per USDT`
                : "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
            <span className="text-sm text-muted-foreground">Rate</span>
            <span className="font-mono text-sm font-medium tabular-nums text-foreground">
              {formatRate("USDT", targetCurrency, quote.customerRate)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">Fee</span>
            <span className="text-sm font-medium text-foreground">
              {formatNumber(quote.markupRate * 100, 2)}%
            </span>
          </div>
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            Final amount uses the rate when your USDT arrives. It goes to your {targetCurrency}{" "}
            wallet.
          </p>
        </Card>
      )}

      <Button
        fullWidth
        disabled={!quote || amount <= 0 || belowMinimum || quoting}
        onClick={() => setStep("confirm")}
      >
        Continue
      </Button>
    </div>
  );
}

/**
 * Step 3. The timeline and, while waiting, the real USDT deposit screen's
 * essentials (address, QR, countdown) — not the whole DepositForm, because
 * this screen also owns the estimate and the sell-specific copy the generic
 * one knows nothing about.
 */
function SellOrderStatus({
  order,
  cryptoAddress,
  fallbackAmount,
  fallbackTargetCurrency,
  beginError,
  onDone,
}: {
  order: SellOrderView | null;
  cryptoAddress?: { address: string; network: string; expiresAt: string };
  fallbackAmount: number;
  fallbackTargetCurrency: Currency;
  beginError: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const secondsLeft = useCountdown(cryptoAddress?.expiresAt);
  const expired = cryptoAddress != null && secondsLeft === 0;

  const targetCurrency = (order?.target_currency ?? fallbackTargetCurrency) as Currency;
  const amount = order?.expected_usdt_amount ?? fallbackAmount;
  const status = order?.status ?? "awaiting_deposit";

  if (!order && beginError) {
    return (
      <Banner tone="danger" title="Couldn't start that sale">
        {beginError}
      </Banner>
    );
  }

  const timelineStep =
    status === "awaiting_deposit" ? 1 : status === "received" ? 2 : 3;
  const timelineLabels = [
    "Waiting for USDT",
    "USDT received",
    status === "credited_usdt"
      ? "Couldn't sell — credited to USDT"
      : status === "failed"
        ? "Needs a look"
        : status === "expired"
          ? "Expired"
          : "Sold",
  ];

  return (
    <div className="space-y-4">
      <ol className="flex items-center gap-2">
        {timelineLabels.map((label, index) => {
          const reached = index + 1 <= timelineStep;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  reached ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`truncate text-xs font-medium ${reached ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {status === "awaiting_deposit" && cryptoAddress && (
        <>
          <Banner tone="info" title={`Send only USDT on ${networkLabel(cryptoAddress.network)}`}>
            Anything sent on another network, or in any other token, can&apos;t be recovered.
          </Banner>

          {!expired ? (
            <>
              <DepositAddressQr
                address={cryptoAddress.address}
                network={cryptoAddress.network}
                currency="USDT"
              />
              <CopyField label="USDT address" value={cryptoAddress.address} />

              <Card className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">Details expire in</span>
                <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                  {formatCountdown(secondsLeft)}
                </span>
              </Card>
            </>
          ) : (
            <Banner tone="warning" title="These details have expired" action={{ href: "/sell", label: "Start a new sale" }}>
              Don&apos;t send anything to them now. Start again and we&apos;ll generate a new
              address for you.
            </Banner>
          )}

          <Card className="space-y-1">
            <p className="text-sm text-muted-foreground">
              You&apos;re selling <strong className="text-foreground">{formatAmount("USDT", amount)}</strong>
            </p>
            {order && (
              <p className="text-sm text-muted-foreground">
                Estimated{" "}
                <strong className="text-foreground">
                  {formatAmount(targetCurrency, order.estimated_target_amount)}
                </strong>{" "}
                — final amount uses the rate when your USDT arrives.
              </p>
            )}
          </Card>
        </>
      )}

      {status === "received" && (
        <Banner tone="info" title="Selling your USDT">
          Your USDT has landed — we&apos;re converting it now. This page updates itself.
        </Banner>
      )}

      {status === "sold" && (
        <>
          <Banner tone="success" title={`Sold. ${formatAmount(targetCurrency, order!.soldAmount ?? order!.estimated_target_amount)} added to your wallet`}>
            It&apos;s in your {targetCurrency} wallet now.
          </Banner>

          <Card>
            <DetailRow label="Sold">{formatAmount("USDT", amount)}</DetailRow>
            <DetailRow label="Received">
              {formatAmount(targetCurrency, order!.soldAmount ?? order!.estimated_target_amount)}
            </DetailRow>
          </Card>

          <Button
            fullWidth
            onClick={() =>
              router.push(
                `/withdraw?currency=${targetCurrency}&amount=${order!.soldAmount ?? order!.estimated_target_amount}`,
              )
            }
          >
            Withdraw to bank
          </Button>
          <Button variant="secondary" fullWidth onClick={onDone}>
            Done
          </Button>
        </>
      )}

      {status === "credited_usdt" && (
        <>
          <Banner tone="info" title="Couldn't sell your USDT automatically">
            So it&apos;s in your USDT wallet instead. You can sell it from there.
          </Banner>
          <Button fullWidth onClick={() => router.push("/accounts/USDT")}>
            Go to your USDT wallet
          </Button>
          <Button variant="secondary" fullWidth onClick={onDone}>
            Done
          </Button>
        </>
      )}

      {status === "expired" && (
        <Banner tone="warning" title="This sell order expired" action={{ href: "/sell", label: "Start again" }}>
          No USDT arrived in time, so nothing happened — there is nothing to undo.
        </Banner>
      )}

      {status === "failed" && (
        <Banner tone="danger" title="Something needs a look">
          Contact support with this reference: {order?.id}
        </Banner>
      )}
    </div>
  );
}
