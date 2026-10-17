/**
 * What a failing auth action is allowed to hand back to the browser.
 *
 * WHY THIS IS NOT IN src/lib/actions/auth.ts
 *
 * Two reasons, and the second is the one that matters.
 *
 * 1. Every export of a `"use server"` file must be an async function — Next
 *    treats each one as a callable server action — so a plain helper cannot
 *    live there at all.
 *
 * 2. A server action cannot be imported by a unit test: it pulls in
 *    next/navigation and the Supabase server client, both of which need a
 *    request scope node:test has no way to provide. Putting the rule here
 *    makes it testable, and — the point — makes the test guard the code the
 *    action actually runs rather than a copy of it.
 *
 * THE RULE: the echo carries what the user can SEE and would have to retype.
 * It never carries a secret. An action state is serialised into the RSC
 * payload and sent to the browser, so a password echoed here is a password on
 * the wire for no benefit — the user retypes it either way, because a
 * password field they cannot read is not one they can correct.
 */

export interface LoginEcho {
  email?: string;
}

export interface SignupEcho {
  email?: string;
  fullName?: string;
  country?: string;
}

/** The email, and nothing else. Takes only the email for that reason. */
export function loginFailureValues(email: string): LoginEcho {
  return { email };
}

/** Everything on the signup form except the password. */
export function signupFailureValues(input: {
  email: string;
  fullName: string;
  country: string;
}): SignupEcho {
  return { email: input.email, fullName: input.fullName, country: input.country };
}
