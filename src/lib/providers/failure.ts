/**
 * Turning a payment provider's refusal into something the customer can act on.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE PROBLEM THIS EXISTS FOR
 *
 * Every provider failure in this app — a deposit quote, a conversion, a
 * payout — collapsed into one sentence: "We couldn't complete that right now.
 * Please try again in a moment." That is the right instinct (a provider's own
 * error text names the provider and is not ours to control) taken one step too
 * far, and it costs twice:
 *
 *   - The customer below a minimum is told to "try again in a moment" and does
 *     exactly that, with the same amount, forever. The one thing that would
 *     fix it — a larger amount — is the one thing the message does not say.
 *   - Support, and anyone debugging, cannot tell "this account cannot quote
 *     NGN deposits at all" from "that amount is 50 naira short" from "the
 *     provider is down", because all three render identically.
 *
 * So: classify the failure, then speak to it. The classification reads the
 * provider's message; the OUTPUT is always our own copy. Nothing the provider
 * wrote is ever shown, which is what keeps the "never name a provider" rule
 * intact while still being specific. failure.test.ts asserts that directly,
 * including for a provider message that contains the provider's own name.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY MATCH ON TEXT AT ALL
 *
 * It is not the first choice. Busha's error bodies are
 * {"error":{"name":…,"message":…}} and the `name` field would be the stable
 * key — except that the failures actually observed live on this account come
 * back as a bare "Request validation failed" with the real reason nowhere but
 * the prose, and sometimes not even there. Status alone cannot separate "below
 * the minimum" from "that network is not supported": both are 422.
 *
 * Text matching is therefore the only signal available for the distinctions
 * that matter, and it is written to DEGRADE WELL: every pattern that fails to
 * match simply falls back to a less specific category, ending at the same
 * generic sentence this replaced. A provider rewording an error makes a
 * message vaguer. It never makes it wrong, and it never makes it leak.
 */

/** What went wrong, in terms the app can act on. */
export type ProviderFailure =
  /** The amount is under a floor the provider enforces. */
  | "below_minimum"
  /** The amount is over a ceiling, or over what the provider will do at once. */
  | "above_maximum"
  /** The provider cannot source that much right now. A smaller amount may work. */
  | "insufficient_liquidity"
  /** This currency, network or corridor is not enabled for this account. */
  | "unsupported"
  /** Too many requests. */
  | "rate_limited"
  /** The provider is down, timing out, or erroring internally. */
  | "temporarily_unavailable"
  /**
   * Authentication or configuration on OUR side — a missing key, a revoked
   * key, a permission the account has not been granted. The customer sees the
   * same thing as an outage (correctly: there is nothing they can do), but
   * this is separated so the logs and any future alerting can tell the
   * difference, because this one never resolves on its own.
   */
  | "not_configured"
  /** The provider refused the request and we could not tell why. */
  | "rejected"
  /**
   * The reference has been used before. NEVER a retry: Korapay refuses a
   * second disbursement carrying a reference it already has, which is the
   * mechanism that stops a timed-out payout being paid twice. Reaching this
   * means the payout already exists and the right next step is to QUERY it,
   * not to send it again — see queryDisbursement in src/lib/korapay/client.ts.
   */
  | "duplicate_reference"
  /**
   * GROUP 4. Korapay refused to issue a virtual account because the BVN it
   * was given is invalid, or does not match the name on the account — never
   * a retry with the same BVN. The caller (src/lib/korapay/virtualAccount.ts)
   * deletes the saved BVN and sends the customer back to the BVN step rather
   * than showing the generic "didn't check out" message every other
   * `rejected` refusal gets, because this one specifically is self-correcting
   * if they re-enter it.
   */
  | "bvn_mismatch"
  /** Not a recognisable provider failure at all. */
  | "unknown";

/**
 * Ordered, and the order is load-bearing: the first match wins, so the
 * specific patterns must precede the general ones. "Invalid network. TRC20 is
 * not supported by USDT" matches both `unsupported` and the catch-all
 * "invalid" of `rejected`, and `unsupported` is the useful answer.
 */
const PATTERNS: Array<{ failure: ProviderFailure; test: RegExp }> = [
  // KORAPAY, and first of all: a reused reference. It has to precede
  // `rejected` (which matches the bare "invalid") and `unsupported` (which
  // matches "duplicate" nowhere but could through a reworded message), because
  // mistaking it for either would send the payout path back to the provider
  // with the same reference — the one outcome this category exists to prevent.
  {
    failure: "duplicate_reference",
    test: /duplicate\s+(reference|transaction)|reference\s+(has\s+)?already\s+(been\s+)?(exists?|used|processed)|already\s+(exists|processed)/i,
  },
  // Liquidity first: "insufficient balance" contains neither "minimum" nor
  // "maximum" but would be swallowed by the generic validation pattern.
  {
    failure: "insufficient_liquidity",
    test: /insufficient\s+(balance|funds|liquidity)|not\s+enough\s+(balance|funds|liquidity)|no\s+liquidity/i,
  },
  {
    failure: "below_minimum",
    test: /below\s+(the\s+)?min|minimum|too\s+(small|low)|at\s+least|less\s+than\s+the\s+min|lower\s+limit/i,
  },
  {
    failure: "above_maximum",
    test: /above\s+(the\s+)?max|maximum|too\s+(large|high|big)|exceed|upper\s+limit|limit\s+exceeded/i,
  },
  {
    failure: "unsupported",
    // restricted_feature is the exact shape of Busha's error.name for a
    // corridor or network this account's agreement doesn't cover — observed
    // live, not guessed at. It carries no English words a prose pattern
    // could match (toCustomerError appends the code to the classified
    // text precisely so this line has something to match against), so it's
    // matched as its own alternative rather than folded into "restricted".
    test: /not\s+supported|unsupported|invalid\s+network|not\s+enabled|not\s+available|no\s+such\s+pair|unavailable\s+(pair|currency|corridor)|disabled|restricted/i,
  },
  // KORAPAY, virtual account issuance. Must precede `rejected`, which would
  // otherwise swallow "Invalid BVN" via its own bare "invalid" alternative.
  {
    failure: "bvn_mismatch",
    test: /\bbvn\b.{0,40}(invalid|incorrect|mismatch|does(?:n't| not)\s+match|not\s+valid)|(invalid|incorrect|mismatch).{0,40}\bbvn\b/i,
  },
  // The real shape of a Busha refusal on this account, and the least
  // informative. Deliberately last among the text patterns.
  {
    failure: "rejected",
    test: /validation\s+failed|invalid|required|must\s+be|bad\s+request|malformed/i,
  },
];

/**
 * Classify from the HTTP status and the provider's own message.
 *
 * Status is checked first where it is unambiguous (auth, rate limit, 5xx) and
 * the text is consulted only for the 4xx band, where it is the only thing that
 * separates one refusal from another.
 */
export function classifyProviderFailure(
  status: number | undefined,
  message: string | undefined,
): ProviderFailure {
  // A 500 we raised ourselves for a missing env var — see the BushaError and
  // KlashaError constructor calls for "is not configured". Caught before the
  // 5xx branch below, which would otherwise call it an outage.
  if (message && /is not configured|no readable expiry/i.test(message)) return "not_configured";

  // KORAPAY. An IP that is not on the provider's payout allowlist comes back
  // as a 401/403 with prose about whitelisting. The blanket 401/403 rule below
  // would already land it on not_configured, but only by accident of status —
  // a provider that answers 400 for it would be read as a customer-fixable
  // refusal, and no customer can fix our egress IP. Named explicitly instead.
  if (message && /whitelist|not\s+permitted|unauthorized\s+ip|ip\s+address/i.test(message)) {
    return "not_configured";
  }

  // KORAPAY. status 0 is this client's marker for "no answer at all" — a
  // timeout or a dead socket, set by the catch in src/lib/korapay/client.ts.
  // It is an outage from the customer's point of view; what makes it special
  // is on OUR side, where it means the result is unknown rather than failed.
  if (status === 0 || (message && /did not complete|timed?\s*out|aborted/i.test(message))) {
    return "temporarily_unavailable";
  }

  // GROUP 7. Busha returns restricted_feature as a 403 — the same status the
  // blanket rule two lines down reads as "our own API key is wrong". Those
  // are different problems with different customer messages (this account's
  // agreement doesn't cover a corridor, vs. an outage that isn't the
  // customer's concern), so the named business-rule code is checked first,
  // same precedence as "is not configured" above it.
  if (message && /restricted/i.test(message)) return "unsupported";

  if (status === 401 || status === 403) return "not_configured";
  if (status === 429) return "rate_limited";
  if (status != null && status >= 500) return "temporarily_unavailable";

  if (message) {
    for (const { failure, test } of PATTERNS) {
      if (test.test(message)) return failure;
    }
  }

  // A 4xx with nothing recognisable in it is still a refusal, and saying so is
  // more honest than "try again in a moment" — retrying an unchanged request
  // the provider already refused will refuse again.
  if (status != null && status >= 400 && status < 500) return "rejected";

  return "unknown";
}

/**
 * The generic line, kept verbatim from what this replaced. Still correct for a
 * genuinely unknown failure, and still what every unclassified path reaches.
 */
export const GENERIC_PROVIDER_MESSAGE =
  "We couldn't complete that right now. Please try again in a moment, or contact support if it continues.";

export interface ProviderMessageContext {
  /** Used to make a minimum or maximum concrete rather than abstract. */
  currency?: string;
  /**
   * The known floor for this currency, in its own units, already formatted.
   * Omitted when no confirmed figure exists — see FIAT_MINIMUM_DEPOSIT, which
   * deliberately leaves NGN and GHS unset rather than guessing.
   */
  formattedMinimum?: string;
  /**
   * What the user was trying to do, as a verb phrase, for the one category
   * that reads badly without it ("we can't convert NGN that way" vs "we can't
   * process NGN that way").
   */
  action?: "deposit" | "conversion" | "withdrawal" | "payment";
}

const ACTION_NOUN: Record<NonNullable<ProviderMessageContext["action"]>, string> = {
  deposit: "deposit",
  conversion: "conversion",
  withdrawal: "withdrawal",
  payment: "payment",
};

/**
 * Our copy for a classified failure. Never the provider's words, never the
 * provider's name, and never a number we did not already know independently.
 */
export function customerMessageFor(
  failure: ProviderFailure,
  context: ProviderMessageContext = {},
): string {
  const { currency, formattedMinimum, action } = context;
  const noun = action ? ACTION_NOUN[action] : null;

  switch (failure) {
    case "below_minimum":
      // The floor when we know it — this is the whole value of the category.
      // Without it the message still beats the generic one, because "larger"
      // is actionable and "try again" is not.
      if (formattedMinimum) {
        return `That's below the minimum. The smallest ${currency ?? ""} ${noun ?? "amount"} we can process is ${formattedMinimum}.`.replace(
          /\s+/g,
          " ",
        );
      }
      return `That amount is too small to process${currency ? ` in ${currency}` : ""}. Try a larger amount.`;

    case "above_maximum":
      return `That amount is more than we can process in one go. Try a smaller amount, or split it across two${noun ? ` ${noun}s` : ""}.`;

    case "insufficient_liquidity":
      return "We can't cover that amount at the moment. A smaller amount may go through, or try again shortly.";

    case "unsupported":
      return currency
        ? `We can't process ${currency} this way at the moment.`
        : "We can't process that method at the moment.";

    case "rate_limited":
      return "That was a lot of attempts in a short time. Wait a moment, then try again.";

    case "not_configured":
      // Deliberately indistinguishable from an outage to the customer. The
      // truth ("our key is wrong") is neither actionable nor theirs to know,
      // and saying it would be a configuration disclosure. The LOG says it.
      return "This is temporarily unavailable. Nothing has been taken — please try again shortly, or contact support if it continues.";

    case "temporarily_unavailable":
      return "This is temporarily unavailable. Nothing has been taken — please try again in a few minutes.";

    case "rejected":
      // Not "try again in a moment": the same request will be refused again.
      return "That request was refused. Check the amount and try again — or contact support if it keeps happening.";

    case "bvn_mismatch":
      return "That BVN didn't match the name on your account. Check it and try again.";

    case "duplicate_reference":
      // Says "already in progress", never "failed". The money may well be on
      // its way; telling someone it failed invites a second attempt, which is
      // exactly what a duplicate reference was refused to prevent.
      return "That one is already in progress. Give it a few minutes — don't send it again.";

    case "unknown":
    default:
      return GENERIC_PROVIDER_MESSAGE;
  }
}

/**
 * Whether a failure is worth retrying unchanged. Used to decide whether a
 * message says "try again" at all, and available to any future retry logic so
 * the two can never disagree about which failures are transient.
 */
export function isTransientFailure(failure: ProviderFailure): boolean {
  return (
    failure === "temporarily_unavailable" ||
    failure === "rate_limited" ||
    failure === "insufficient_liquidity"
  );
}
