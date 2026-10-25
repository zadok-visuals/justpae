import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GENERIC_PROVIDER_MESSAGE,
  classifyProviderFailure,
  customerMessageFor,
  isTransientFailure,
  type ProviderFailure,
} from "./failure.ts";

/**
 * Two properties, and the second is the one that must never regress.
 *
 *   1. The classification is useful — a customer below a minimum is told to
 *      send more, not to "try again in a moment".
 *   2. The output NEVER contains the provider's words. Being more specific is
 *      exactly the change that risks leaking the provider's own text, so the
 *      leak test runs over every message the module can produce, including
 *      for inputs that have a provider's name sitting in them.
 */

/** Every real error string observed against the live accounts, plus the shapes
 *  the providers' docs describe. Kept together so a reword is one edit. */
const REAL_MESSAGES = {
  bushaValidation: "Request validation failed",
  bushaNetwork: "Invalid network. TRC20/ERC20 is not supported by USDT",
  bushaBalance: "insufficient balance",
  missingKey: "BUSHA_API_KEY is not configured",
  klashaMissingKey: "KLASHA_ENCRYPTION_SECRET is not configured",
};

test("status alone settles the cases where it is unambiguous", () => {
  assert.equal(classifyProviderFailure(401, "Unauthorized"), "not_configured");
  assert.equal(classifyProviderFailure(403, "Forbidden"), "not_configured");
  assert.equal(classifyProviderFailure(429, "Too many requests"), "rate_limited");
  assert.equal(classifyProviderFailure(500, "Internal server error"), "temporarily_unavailable");
  assert.equal(classifyProviderFailure(502, "Bad gateway"), "temporarily_unavailable");
  assert.equal(classifyProviderFailure(503, ""), "temporarily_unavailable");
});

test("our own missing-configuration guards are not mistaken for an outage", () => {
  // These are thrown with status 500 by the clients themselves. Read as a 5xx
  // they look like the provider is down, and someone waits for it to recover.
  // It never will — the env var is missing.
  assert.equal(classifyProviderFailure(500, REAL_MESSAGES.missingKey), "not_configured");
  assert.equal(classifyProviderFailure(500, REAL_MESSAGES.klashaMissingKey), "not_configured");
});

test("a minimum is distinguished from every other 422", () => {
  for (const message of [
    "amount is below the minimum",
    "Minimum amount is 200",
    "amount too small",
    "amount too low",
    "source_amount must be at least 1000",
  ]) {
    assert.equal(classifyProviderFailure(422, message), "below_minimum", message);
  }
});

test("a maximum is distinguished too", () => {
  for (const message of [
    "amount exceeds the maximum",
    "Maximum transfer amount is 5000000",
    "amount too large",
    "daily limit exceeded",
  ]) {
    assert.equal(classifyProviderFailure(422, message), "above_maximum", message);
  }
});

test("insufficient balance is liquidity, not validation", () => {
  // Checked before the generic patterns on purpose: this string contains
  // nothing that reads as "minimum", but it is the single most common real
  // refusal on a sell-side quote when the account float is low.
  assert.equal(classifyProviderFailure(422, REAL_MESSAGES.bushaBalance), "insufficient_liquidity");
  assert.equal(classifyProviderFailure(400, "Insufficient funds in account"), "insufficient_liquidity");
  assert.equal(classifyProviderFailure(400, "not enough liquidity for this pair"), "insufficient_liquidity");
});

test("an unsupported network wins over the generic 'invalid'", () => {
  // The real string contains BOTH "Invalid" and "is not supported". If the
  // generic validation pattern were checked first this would classify as
  // `rejected` and the customer would be told to check the amount, which is
  // not the problem at all.
  assert.equal(classifyProviderFailure(422, REAL_MESSAGES.bushaNetwork), "unsupported");
  assert.equal(classifyProviderFailure(422, "GHS is not enabled for this account"), "unsupported");
  assert.equal(classifyProviderFailure(404, "no such pair"), "unsupported");
});

test("GROUP 7 — restricted_feature is unsupported, not a generic refusal", () => {
  // Busha's own error.name for this account's agreement not covering a
  // corridor — observed live. toCustomerError appends this code to the
  // classified text (see provider-error.test.ts); asserted here on the code
  // alone, which is also what the prose message alone would NOT match on.
  assert.equal(classifyProviderFailure(403, "restricted_feature"), "unsupported");
  assert.equal(
    classifyProviderFailure(403, "This feature is restricted for your account"),
    "unsupported",
  );
});

test("the bare refusal this account actually returns is classified as a refusal", () => {
  // "Request validation failed" with nothing else is the real Group 2 symptom.
  // It cannot be made more specific than "refused" — and saying "refused" is
  // still better than "try again in a moment", because retrying the same
  // request will fail the same way.
  assert.equal(classifyProviderFailure(422, REAL_MESSAGES.bushaValidation), "rejected");
  assert.equal(classifyProviderFailure(400, REAL_MESSAGES.bushaValidation), "rejected");
});

test("an unrecognisable 4xx is still a refusal, not an outage", () => {
  assert.equal(classifyProviderFailure(418, "zzzz"), "rejected");
  assert.equal(classifyProviderFailure(409, ""), "rejected");
});

test("no status and no message is unknown, and unknown keeps the old wording", () => {
  assert.equal(classifyProviderFailure(undefined, undefined), "unknown");
  assert.equal(customerMessageFor("unknown"), GENERIC_PROVIDER_MESSAGE);
});

test("a network error with no status falls through rather than being guessed at", () => {
  // fetch() rejecting with "fetch failed" carries no status at all. Calling
  // that an outage would often be right and sometimes be a DNS typo; unknown
  // is the honest classification and reaches the same safe sentence.
  assert.equal(classifyProviderFailure(undefined, "fetch failed"), "unknown");
});

test("the minimum message states the figure when we know it", () => {
  const shown = customerMessageFor("below_minimum", {
    currency: "KES",
    formattedMinimum: "KES 200.00",
    action: "deposit",
  });
  assert.match(shown, /KES 200\.00/);
  assert.match(shown, /KES/);
  // The whole point of the category: it must not tell them to wait.
  assert.doesNotMatch(shown, /try again in a moment/i);
});

test("the minimum message is still actionable when we do not know the figure", () => {
  // NGN and GHS deliberately have no confirmed floor (see FIAT_MINIMUM_DEPOSIT).
  const shown = customerMessageFor("below_minimum", { currency: "NGN" });
  assert.match(shown, /larger/i);
  assert.doesNotMatch(shown, /undefined|null|NaN/);
});

test("no message ever contains a stray undefined or a double space", () => {
  const failures: ProviderFailure[] = [
    "below_minimum",
    "above_maximum",
    "insufficient_liquidity",
    "unsupported",
    "rate_limited",
    "temporarily_unavailable",
    "not_configured",
    "rejected",
    "unknown",
  ];
  const contexts = [
    {},
    { currency: "NGN" },
    { currency: "KES", formattedMinimum: "KES 200.00" },
    { currency: "USDT", action: "deposit" as const },
    { action: "withdrawal" as const },
  ];

  for (const failure of failures) {
    for (const context of contexts) {
      const shown = customerMessageFor(failure, context);
      assert.doesNotMatch(shown, /undefined|null|NaN/, `${failure} ${JSON.stringify(context)}`);
      assert.doesNotMatch(shown, / {2}/, `${failure} has a double space: "${shown}"`);
      assert.ok(shown.trim().length > 20, `${failure} is too terse: "${shown}"`);
      assert.match(shown, /[.!]$/, `${failure} does not end in a full stop: "${shown}"`);
    }
  }
});

/**
 * THE RULE THAT MATTERS MOST. Customer copy never names a provider, and this
 * module is the one place that reads provider text and then emits copy — so
 * it is the one place a leak could be introduced by a well-meaning edit that
 * interpolates the message it just classified.
 */
test("no classified message ever leaks a provider name or the provider's own words", () => {
  const hostileMessages = [
    "Busha: insufficient balance on your account",
    "Klasha returned an error: amount too small",
    "busha.io rejected the request — validation failed",
    "Your BUSHA_API_KEY is not configured",
    "Transfer declined by Busha Business, minimum is 1000",
  ];

  for (const message of hostileMessages) {
    for (const status of [400, 401, 422, 429, 500, 503]) {
      const failure = classifyProviderFailure(status, message);
      const shown = customerMessageFor(failure, { currency: "NGN", action: "deposit" });

      assert.doesNotMatch(shown, /busha|klasha/i, `leaked a provider name: "${shown}"`);
      // And it must not echo the provider's sentence back either, even
      // unnamed — the wording is not ours to publish.
      assert.doesNotMatch(shown, /API_KEY|declined by|returned an error/i, shown);
    }
  }
});

test("customer copy never says 'exchange' as the name of the action", () => {
  const failures: ProviderFailure[] = [
    "below_minimum",
    "above_maximum",
    "insufficient_liquidity",
    "unsupported",
    "rate_limited",
    "temporarily_unavailable",
    "not_configured",
    "rejected",
    "unknown",
  ];
  for (const failure of failures) {
    const shown = customerMessageFor(failure, { currency: "NGN", action: "conversion" });
    assert.doesNotMatch(shown, /\bexchanges?\b(?!\s+rate)/i, shown);
  }
});

test("only the failures that can resolve on their own are called transient", () => {
  assert.equal(isTransientFailure("temporarily_unavailable"), true);
  assert.equal(isTransientFailure("rate_limited"), true);
  assert.equal(isTransientFailure("insufficient_liquidity"), true);

  // These never fix themselves, and anything that retries on them loops.
  assert.equal(isTransientFailure("below_minimum"), false);
  assert.equal(isTransientFailure("above_maximum"), false);
  assert.equal(isTransientFailure("unsupported"), false);
  assert.equal(isTransientFailure("not_configured"), false);
  assert.equal(isTransientFailure("rejected"), false);
  assert.equal(isTransientFailure("unknown"), false);
});

test("a non-transient message does not invite an immediate identical retry", () => {
  for (const failure of ["below_minimum", "above_maximum", "unsupported"] as ProviderFailure[]) {
    const shown = customerMessageFor(failure, { currency: "NGN" });
    assert.doesNotMatch(shown, /try again in a (moment|few minutes)/i, `${failure}: "${shown}"`);
  }
});
