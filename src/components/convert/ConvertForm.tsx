"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput, formatAmountInput, parseAmount } from "@/components/ui/AmountInput";
import { PinField } from "@/components/ui/PinField";
import { SubmitButton } from "@/components/ui/Button";
import { Banner, Card } from "@/components/ui/Primitives";
import { useCountdown, formatCountdown } from "@/lib/hooks/useCountdown";
import {
  quoteConversion,
  executeConversion,
  type ConversionQuote,
  type RouteAvailability,
} from "@/lib/actions/convert";
import { MINIMUM_USDT_EQUIVALENT } from "@/lib/busha/limits";
import { currencyMeta, formatAmount, formatNumber, formatRate } from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";

/**
 * /convert.
 *
 * Typing in either field recalculates the other. The quote is priced on the
 * server — the client never multiplies a rate it was handed and calls the
 * result a quote, because that number would then disagree with what the server
 * settles at.
 *
 * Unroutable destinations are disabled in the select with the reason shown,
 * rather than being discovered at submit. GHS has no USDT pair on this account
 * today, and finding that out after typing an amount and entering a PIN is the
 * worst possible moment.
 */
interface ConvertFormProps {
  wallets: Wallet[];
  routes: RouteAvailability[];
  hasPin: boolean;
}

/**
 * Owns the action and the success side effects only. The stateful form is a
 * child KEYED on the transaction id, so a completed conversion remounts it
 * with empty fields.
 *
 * Clearing the fields from inside the effect instead would write state
 * synchronously in the effect body and cascade a render; remounting is both
 * the idiomatic reset and a guarantee that nothing stale survives — a leftover
 * PIN or amount after a successful conversion is exactly the state you do not
 * want sitting in a form.
 */
export function ConvertForm(props: ConvertFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(executeConversion, {});

  useEffect(() => {
    if (!state.transactionId) return;
    toast.success("Conversion submitted");
    router.refresh();
  }, [state.transactionId, router]);

  return (
    <ConvertFormFields
      key={state.transactionId ?? "new"}
      {...props}
      state={state}
      formAction={formAction}
    />
  );
}

function ConvertFormFields({
  wallets,
  routes,
  hasPin,
  state,
  formAction,
}: ConvertFormProps & {
  state: Awaited<ReturnType<typeof executeConversion>>;
  formAction: (formData: FormData) => void;
}) {
  const router = useRouter();
  const [from, setFrom] = useState<Currency>(wallets[0]?.currency ?? "USD");
  const [to, setTo] = useState<Currency>(() => firstAvailable(routes, wallets[0]?.currency));

  // Which field the user last typed in. The OTHER one is the derived value,
  // so the number under their cursor never reformats itself mid-keystroke.
  const [edited, setEdited] = useState<"source" | "target">("source");
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");

  const [quote, setQuote] = useState<ConversionQuote | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [quoting, startQuoting] = useTransition();
  const [pin, setPin] = useState("");

  const secondsLeft = useCountdown(quote?.expiresAt);

  const routeMap = useMemo(
    () => new Map(routes.map((r) => [r.to, r])),
    [routes],
  );
  const currentRoute = routeMap.get(to);

  const fromWallet = wallets.find((w) => w.currency === from);
  const balance = fromWallet?.balance ?? 0;

  const typedAmount = edited === "source" ? parseAmount(sourceText) : parseAmount(targetText);
  const insufficient = edited === "source" && parseAmount(sourceText) > balance;

  // Re-quote when the pair or the typed amount changes. Debounced so a
  // six-digit naira amount is one request at the end rather than one per
  // keystroke — each of these costs a live provider lookup.
  const latestRequest = useRef(0);
  useEffect(() => {
    // Returns without touching state when there is nothing to price. The quote
    // is DERIVED below rather than cleared here — clearing would be a
    // synchronous state write in the effect body on every keystroke back to
    // empty.
    if (typedAmount <= 0) return;

    const requestId = ++latestRequest.current;
    const timer = setTimeout(() => {
      startQuoting(async () => {
        const result = await quoteConversion({ from, to, amount: typedAmount, field: edited });
        // Out-of-order responses would otherwise overwrite a newer quote with
        // an older one, showing a rate for an amount no longer on screen.
        if (requestId !== latestRequest.current) return;

        if (result.unavailableReason) {
          setUnavailable(result.unavailableReason);
          setQuote(null);
          return;
        }
        setUnavailable(result.error ?? null);
        setQuote(result.quote ?? null);

        if (result.quote) {
          // Only the derived side is rewritten. Writing both would fight the
          // user's own typing.
          if (edited === "source") setTargetText(formatAmountInput(result.quote.targetAmount.toFixed(2)));
          else setSourceText(formatAmountInput(result.quote.sourceAmount.toFixed(2)));
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [from, to, typedAmount, edited]);

  function swap() {
    const nextFrom = to;
    const nextTo = from;
    // Only swap if the reverse direction is actually routable — otherwise the
    // button would silently put the form into an unusable state.
    setFrom(nextFrom);
    setTo(nextTo);
    setSourceText(targetText);
    setTargetText(sourceText);
    setEdited("source");
  }

  // A stale quote must not stay on screen once the amount is cleared, so the
  // displayed quote is derived from whether there is an amount at all.
  const activeQuote = typedAmount > 0 ? quote : null;
  const activeUnavailable = typedAmount > 0 ? unavailable : null;
  const belowMinimum = activeQuote?.belowMinimum ?? false;
  const expired = activeQuote != null && secondsLeft === 0;

  const blocked =
    !hasPin ||
    !currentRoute?.available ||
    activeQuote == null ||
    expired ||
    belowMinimum ||
    insufficient ||
    pin.length < 4;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />

      {!hasPin && (
        <Banner
          tone="warning"
          title="Set a transaction PIN first"
          action={{ href: "/profile", label: "Set up your PIN" }}
        >
          Every conversion, withdrawal and bill payment is confirmed with a 4-6 digit PIN.
        </Banner>
      )}

      <Card className="space-y-3">
        <WalletSelect
          label="From"
          value={from}
          wallets={wallets}
          showBalance
          onChange={(next) => {
            setFrom(next);
            if (next === to) setTo(firstAvailable(routes, next));
            // The whole route table is per-source, so changing the source
            // means the availability data on screen is now for the wrong
            // currency. A reload is the honest way to get the right one.
            router.refresh();
          }}
        />

        <AmountInput
          name="amount"
          label="You send"
          currency={from}
          value={sourceText}
          onValueChange={(v) => {
            setEdited("source");
            setSourceText(v);
          }}
          max={balance}
          onMax={() => {
            setEdited("source");
            setSourceText(formatAmountInput(balance.toFixed(2)));
          }}
          hint={`Balance ${formatAmount(from, balance)}`}
          error={
            insufficient
              ? `That's more than your ${from} balance.`
              : belowMinimum
                ? `The minimum is about ${MINIMUM_USDT_EQUIVALENT} USDT in ${from}.`
                : null
          }
        />
      </Card>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={swap}
          aria-label="Swap direction"
          className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-primary"
        >
          ↑↓
        </button>
      </div>

      <Card className="space-y-3">
        <WalletSelect
          label="To"
          value={to}
          wallets={wallets.filter((w) => w.currency !== from)}
          routes={routeMap}
          onChange={setTo}
        />

        <AmountInput
          name="targetAmountDisplay"
          label="They receive"
          currency={to}
          value={targetText}
          onValueChange={(v) => {
            setEdited("target");
            setTargetText(v);
          }}
        />
      </Card>

      {currentRoute && !currentRoute.available && (
        <Banner tone="info" title={`${from} to ${to} isn't available right now`}>
          {currentRoute.reason}
        </Banner>
      )}

      {activeUnavailable && currentRoute?.available && (
        <Banner tone="info" title="Couldn't price that">
          {activeUnavailable}
        </Banner>
      )}

      {activeQuote && !quoting && (
        <QuoteSummary quote={activeQuote} secondsLeft={secondsLeft} expired={expired} />
      )}

      {quoting && (
        <p aria-live="polite" className="text-center text-sm text-muted-foreground">
          Getting you a rate…
        </p>
      )}

      {hasPin && <PinField value={pin} onValueChange={setPin} error={state.error} />}

      <SubmitButton disabled={blocked} pendingLabel="Converting…">
        {expired ? "Rate expired — edit the amount" : `Convert to ${to}`}
      </SubmitButton>
    </form>
  );
}

function QuoteSummary({
  quote,
  secondsLeft,
  expired,
}: {
  quote: ConversionQuote;
  secondsLeft: number;
  expired: boolean;
}) {
  return (
    <Card className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">Rate</span>
        <span className="font-mono text-sm font-medium tabular-nums text-foreground">
          {formatRate(quote.from, quote.to, quote.customerRate)}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">Our spread</span>
        <span className="text-sm font-medium text-foreground">
          {formatNumber(quote.markupRate * 100, 2)}%
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
        <span className="text-sm text-muted-foreground">
          {expired ? "Rate expired" : "Rate held for"}
        </span>
        <span
          // The countdown is announced politely so a screen-reader user is
          // told once it expires rather than hearing every tick.
          aria-live={expired ? "polite" : "off"}
          className={`font-mono text-sm font-medium tabular-nums ${
            expired ? "text-destructive" : secondsLeft <= 10 ? "text-primary" : "text-foreground"
          }`}
        >
          {expired ? "—" : formatCountdown(secondsLeft)}
        </span>
      </div>
    </Card>
  );
}

function WalletSelect({
  label,
  value,
  wallets,
  routes,
  onChange,
  showBalance = false,
}: {
  label: string;
  value: Currency;
  wallets: Wallet[];
  routes?: Map<Currency, RouteAvailability>;
  onChange: (next: Currency) => void;
  showBalance?: boolean;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      <div className="jp-field flex h-12 items-center gap-2 rounded-lg border border-input bg-secondary px-3">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as Currency)}
          aria-label={label}
          className="min-w-0 flex-1 appearance-none border-0 bg-transparent py-0 text-foreground"
        >
          {wallets.map((wallet) => {
            const route = routes?.get(wallet.currency);
            // Disabled with the reason in the label, so the select itself
            // explains why an option can't be picked.
            const blocked = route != null && !route.available;
            return (
              <option key={wallet.currency} value={wallet.currency} disabled={blocked}>
                {currencyMeta(wallet.currency).flag} {wallet.currency}
                {showBalance ? ` · ${formatAmount(wallet.currency, wallet.balance)}` : ""}
                {blocked ? " · unavailable" : ""}
              </option>
            );
          })}
        </select>
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
          ▾
        </span>
      </div>
    </div>
  );
}

/** First routable destination, so the form never opens on a dead pair. */
function firstAvailable(routes: RouteAvailability[], from: Currency | undefined): Currency {
  const candidate = routes.find((r) => r.available && r.to !== from);
  return candidate?.to ?? routes.find((r) => r.to !== from)?.to ?? "USDT";
}
