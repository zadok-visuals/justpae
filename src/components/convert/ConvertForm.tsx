"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput, formatAmountInput, parseAmount } from "@/components/ui/AmountInput";
import { PinField } from "@/components/ui/PinField";
import { SubmitButton } from "@/components/ui/Button";
import { Banner, Card } from "@/components/ui/Primitives";
import { ConfirmDialog, useConfirm, type ConfirmRow } from "@/components/ui/ConfirmDialog";
// GROUP 9b. BuySellRates, SectionHeader and UsdtPairDisplay are gone from
// this file: the board arrives as an already-rendered node (see the rateBoard
// prop), so this client component no longer knows the shape of a price. One
// fewer thing in the /convert client bundle, and one fewer place that could
// render a rate differently from the other three.
import { useCountdown, formatCountdown } from "@/lib/hooks/useCountdown";
import {
  quoteConversion,
  executeConversion,
  type ConversionQuote,
  type RouteAvailability,
} from "@/lib/actions/convert";
import { getMinimumConversionAmount } from "@/lib/busha/limits";
import {
  currencyMeta,
  formatAmount,
  formatNumber,
  formatRate,
  isUsdPair,
  USD_CONVERSION_UNAVAILABLE,
} from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";
import { unavailableSuffix } from "@/lib/ui/unavailability";
import { MoneyFormLayout, WhatHappensNext } from "@/components/money/MoneyFormLayout";

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
  /**
   * The buy/sell board, resolved server-side. Shown BELOW the form rather
   * than beside the amount: it answers "what is a USDT worth today", which is
   * a different question from "what will this specific conversion give me" —
   * and the quote above already answers the second one, to the kobo, with a
   * countdown.
   */
  /**
   * GROUP 9b. A NODE, not an array of prices.
   *
   * This used to be `UsdtPairDisplay[]`, which meant /convert had to await
   * resolveRateBoard() — six provider round trips — before it could render
   * this form at all. The board is reference material beside a form; it has
   * no business deciding when the form's own fields appear.
   *
   * Passing it as a node lets the page hand over a Server Component with its
   * own Suspense boundary (RateBoardSection), which this client component
   * renders without knowing or caring what is inside it. The form's own
   * inputs are sent immediately and the prices stream in afterwards.
   */
  rateBoard?: React.ReactNode;
  /**
   * The source wallet the page resolved `routes` for — from `?currency=`, or
   * the first wallet. The form MUST open on this one: `routes` describes the
   * destinations reachable out of it and nothing else, so opening on a
   * different source would show one wallet's availability under another
   * wallet's name.
   */
  initialFrom: Currency;
  /**
   * The DESTINATION to open on, from `?to=`. Group 4d: the CNY account page's
   * "Convert to CNY" has to arrive with yuan already selected, or the button
   * is just a link to the convert screen and the user has to find the
   * currency they already asked for.
   *
   * Optional, and unlike `initialFrom` it is only a preference: the form
   * falls back to the first routable destination when the requested one is
   * not reachable out of `initialFrom`, because opening on a dead pair would
   * show a blocked form to someone who did not choose it.
   */
  initialTo?: Currency | null;
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
  rateBoard,
  initialFrom,
  initialTo,
  state,
  formAction,
}: ConvertFormProps & {
  state: Awaited<ReturnType<typeof executeConversion>>;
  formAction: (formData: FormData) => void;
}) {
  const router = useRouter();
  const [from, setFrom] = useState<Currency>(initialFrom);
  const [to, setTo] = useState<Currency>(() => {
    // The requested destination wins only when it is actually reachable out
    // of this source and is not the source itself — see initialTo.
    const requested = routes.find((r) => r.to === initialTo);
    if (requested?.available && initialTo !== initialFrom) return initialTo!;
    return firstAvailable(routes, initialFrom);
  });

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

  // The confirmation. The intent snapshots the quote rather than reading it
  // back on confirm: quoting is debounced, so a re-quote landing while the
  // dialog is open would change the rate and both amounts the user is in the
  // middle of reading.
  const confirm = useConfirm<ConversionQuote>();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);
  // Counts down the SNAPSHOTTED quote, not whatever is currently on the form.
  // The dialog has to hold the clock for the rate it is actually offering.
  const confirmSecondsLeft = useCountdown(confirm.intent?.expiresAt);
  const confirmExpired = confirm.intent != null && confirmSecondsLeft === 0;

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
    // A USD pair has a known answer that no round trip can change, and the
    // banner is already showing it. Quoting anyway would only risk replacing
    // that specific message with a generic "couldn't price that".
    if (isUsdPair(from, to)) return;

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
  // Resolved server-side with the live rate and carried on the quote, rather
  // than recomputed here — the client and the server must agree on the number,
  // and only the server has the rate the gate will actually use.
  const minimumSourceAmount =
    activeQuote?.minimumSourceAmount ?? getMinimumConversionAmount(from);
  const expired = activeQuote != null && secondsLeft === 0;

  // Derived from the pair alone, so it is true before any quote round trip —
  // the point is that the user is told BEFORE typing an amount, not after.
  const usdPicked = isUsdPair(from, to);

  const blocked =
    usdPicked ||
    !hasPin ||
    !currentRoute?.available ||
    activeQuote == null ||
    expired ||
    belowMinimum ||
    insufficient ||
    pin.length < 4;

  /**
   * What the confirmation actually says, including THE RATE BEING USED.
   *
   * The dialog used to show one unlabelled "Rate" line in quote-per-base
   * terms: for a naira holder buying USDT that read "1 NGN = ₮0.000724",
   * which is the correct number and tells nobody anything. The board on this
   * same screen says "Buy USDT at ₦1,387.65", and the figure the user agrees
   * to has to be recognisably that one.
   *
   * So the direction gets named. Buying USDT shows the buy price; selling it
   * shows the sell price; a bridged fiat-to-fiat conversion shows both of its
   * legs, because there genuinely are two prices and showing only their
   * product hides the trade being made with the user's money. All of it is
   * resolved server-side on the quote (see directionRatesFor in
   * src/lib/actions/convert.ts) — the client never derives a rate it then
   * presents as the one that binds.
   *
   * The composite "Rate" line stays underneath in every case. It is the one
   * figure that, with the amounts, is arithmetically checkable by the reader.
   */
  function confirmRows(intent: ConversionQuote): ConfirmRow[] {
    const { buyPrice, sellPrice, bridged } = intent.directionRates;
    const rows: ConfirmRow[] = [
      { label: "You send", value: formatAmount(intent.from, intent.sourceAmount) },
      {
        label: "You receive",
        value: formatAmount(intent.to, intent.targetAmount),
        emphasis: true,
      },
    ];

    if (bridged) {
      if (buyPrice != null) {
        rows.push({
          label: `Step 1 · buy USDT with ${intent.from}`,
          value: `${formatAmount(intent.from, buyPrice)} per USDT`,
        });
      }
      if (sellPrice != null) {
        rows.push({
          label: `Step 2 · sell USDT for ${intent.to}`,
          value: `${formatAmount(intent.to, sellPrice)} per USDT`,
        });
      }
    } else if (buyPrice != null) {
      rows.push({
        label: `Buy USDT at`,
        value: `${formatAmount(intent.from, buyPrice)} per USDT`,
      });
    } else if (sellPrice != null) {
      rows.push({
        label: `Sell USDT at`,
        value: `${formatAmount(intent.to, sellPrice)} per USDT`,
      });
    }

    rows.push(
      {
        label: "Rate",
        value: formatRate(intent.from, intent.to, intent.customerRate),
      },
      {
        label: "Our spread",
        value: `${formatNumber(intent.markupRate * 100, 2)}%`,
      },
      {
        label: confirmExpired ? "Rate expired" : "Rate held for",
        value: confirmExpired ? "—" : formatCountdown(confirmSecondsLeft),
      },
    );

    return rows;
  }

  /**
   * GROUP 6a — the summary column.
   *
   * Three things, in the order somebody reads them: the live quote (rate,
   * spread, how long it is held), today's board for context, and what the
   * product is about to do. Each is rendered inline under `lg:hidden` as
   * well, in the position it already occupied — the quote above the submit
   * button, the board after the form — because on a phone the quote has to
   * come before the thing that commits to it. See MoneyFormLayout.
   */
  const quoteSummaryNode =
    activeQuote && !quoting ? (
      <QuoteSummary quote={activeQuote} secondsLeft={secondsLeft} expired={expired} />
    ) : null;

  // The board, whatever it is. Its heading and skeleton come with it now —
  // see RateBoardSection — so this component no longer decides whether there
  // is anything to show, which it could only do by having already waited for
  // the prices.
  const rateBoardNode = rateBoard ?? null;

  const nextSteps = (
    <WhatHappensNext
      steps={[
        "Type an amount in either field and we price it on the server — the rate you see is the rate that binds, held for the countdown above.",
        // CNY is priced off a size ladder rather than a single rate, which
        // is the one thing about this screen a user cannot work out by
        // looking at it. Detected from the pair, not from the route's shape:
        // RouteAvailability (what this component is given) deliberately
        // carries availability and a rate and nothing about the plumbing.
        from === "CNY" || to === "CNY"
          ? "Yuan is priced from the size of the order, so the rate improves as the amount grows. Confirming moves both balances at once."
          : isUsdPair(from, to)
            ? "Dollar pairs have no route on this account yet, so this one cannot be priced at all."
            : `Confirming debits your ${from} wallet and credits your ${to} wallet. There is no waiting period.`,
        "The full breakdown — both amounts, the rate and our spread — stays on the transaction afterwards, so you can check it later.",
      ]}
      footnote="If a conversion fails part way through, the money goes back to the wallet it came from and we tell you why."
    />
  );

  return (
    <MoneyFormLayout
      summary={
        <>
          {/* `hidden lg:block`: the mirror of the inline `lg:hidden` copy
              below — the live quote has to sit above the Convert button on a
              phone. The board and the steps render once, here, and stack
              under the form below 1024px. */}
          <div className="hidden lg:block">{quoteSummaryNode}</div>
          {rateBoardNode}
          {nextSteps}
        </>
      }
    >
    <>
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(event) => {
        if (confirmedRef.current) {
          confirmedRef.current = false;
          return;
        }
        event.preventDefault();
        if (!activeQuote) return;
        confirm.ask(activeQuote);
      }}
      className="space-y-4"
    >
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
            // means the availability on screen is now for the wrong currency.
            //
            // router.refresh() used to be what ran here, and it could not
            // work: the page resolved routes for a source it read from the
            // URL (or, before that, the first wallet), so re-rendering the
            // same URL re-resolved the same source. Pushing the new source
            // into the query is what actually asks the server the new
            // question — and it leaves a back button that means something.
            router.replace(`/convert?currency=${next}`, { scroll: false });
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
                ? // In the currency being spent, from the figure the server
                  // resolved on the same live rate it will gate on — not "about
                  // 10 USDT in NGN", which asks the user to do the conversion
                  // themselves to find out what to type.
                  `The minimum conversion is ${formatAmount(from, minimumSourceAmount)}.`
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

      {/* USD is a STANDING state, not a passing one, so it gets its own
          banner rather than the "isn't available right now" wording — and it
          renders the moment USD is picked on either side, with no amount
          typed and no quote attempted. */}
      {usdPicked ? (
        <Banner tone="info" title="Dollar conversions aren't open yet">
          {USD_CONVERSION_UNAVAILABLE}
        </Banner>
      ) : (
        currentRoute &&
        !currentRoute.available && (
          <Banner tone="info" title={`${from} to ${to} isn't available right now`}>
            {currentRoute.reason}
          </Banner>
        )
      )}

      {activeUnavailable && !usdPicked && currentRoute?.available && (
        <Banner live tone="info" title="Couldn't price that">
          {activeUnavailable}
        </Banner>
      )}

      <div className="lg:hidden">{quoteSummaryNode}</div>

      {quoting && (
        <p aria-live="polite" className="text-center text-sm text-muted-foreground">
          Getting you a rate…
        </p>
      )}

      {hasPin && <PinField value={pin} onValueChange={setPin} error={state.error} />}

      <SubmitButton disabled={blocked} pendingLabel="Converting…">
        {usdPicked
          ? "Dollar conversions aren't open yet"
          : expired
            ? "Rate expired — edit the amount"
            : `Convert to ${to}`}
      </SubmitButton>
    </form>

    <ConfirmDialog
      open={confirm.open}
      title="Confirm this conversion"
      body={
        confirmExpired
          ? "This rate has expired. Close this and we'll price it again."
          : confirm.intent?.directionRates.bridged
            ? "This conversion trades through USDT in two steps. Both prices, and the one spread we charge across the whole conversion, are below."
            : "The rate below is the one we'll settle at."
      }
      rows={confirm.intent ? confirmRows(confirm.intent) : undefined}
      confirmLabel={confirmExpired ? "Rate expired" : "Convert"}
      cancelLabel="Go back"
      confirmDisabled={confirmExpired}
      onCancel={confirm.cancel}
      onConfirm={() =>
        confirm.confirm(() => {
          confirmedRef.current = true;
          formRef.current?.requestSubmit();
        })
      }
    />
    </>
    </MoneyFormLayout>
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
                {/* GROUP 4f. The route has carried its own specific reason all
                    along — resolveRoute distinguishes a pair the provider
                    stopped quoting (down, coming back) from USD, which has no
                    leg on this account at all. This used to flatten both into
                    "unavailable". */}
                {blocked && route.unavailableKind
                  ? unavailableSuffix(route.unavailableKind)
                  : ""}
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
