// A relative, extension-bearing import, not the "@/" alias: provider-error.ts
// is exercised by a plain `node --test` run, which has no path-alias resolver.
// Same reason as src/lib/cny/priceCore.ts and src/lib/admin/pnlMath.ts.
import {
  type ProviderMessageContext,
  classifyProviderFailure,
  customerMessageFor,
} from "./providers/failure.ts";

/**
 * Never show a payment provider's own error text (or our env-var config
 * guards) to customers — it can name the provider directly, and its wording
 * isn't ours to control. This has happened for real: "BUSHA_API_KEY is not
 * configured" and raw provider error messages were rendered straight into a
 * deposit UI before a helper like this existed.
 *
 * WHAT CHANGED, and why the one-size message was not good enough. Returning a
 * single sentence for every provider failure is safe but useless: a customer
 * fifty naira below a minimum and a customer hitting a provider outage were
 * told the identical "try again in a moment", and only one of them could ever
 * succeed by doing so. src/lib/providers/failure.ts classifies the failure and
 * supplies OUR copy for it — the provider's words are read, never shown.
 *
 * Pass `message` to make the copy concrete (the currency, the known minimum,
 * what the user was doing). Omit it and the classification still applies; the
 * wording is just less specific.
 *
 * Logging is the other half, and the more important half for diagnosis. Every
 * call writes ONE structured entry carrying the provider's HTTP status, its
 * verbatim body, and the classification we derived from them — so a support
 * question ("why did this customer see that?") is answered by one log line
 * rather than by correlating two.
 */
export function toCustomerError(
  err: unknown,
  context: string,
  message: ProviderMessageContext = {},
): string {
  const status = typeof err === "object" && err !== null && "status" in err
    ? (err as { status?: unknown }).status
    : undefined;
  const body = typeof err === "object" && err !== null && "body" in err
    ? (err as { body?: unknown }).body
    : undefined;
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : undefined;
  // Busha's machine-readable error code — {"error":{"name":"restricted_feature",
  // "message":…}} — lives on `body.name`, separately from the human-readable
  // `message` BushaError.message is built from (see busha/client.ts). A code
  // like "restricted_feature" carries no English words a text pattern could
  // ever match, so it has to be classified alongside the prose, not instead
  // of it — appended rather than substituted, so a provider's own wording
  // still gets its chance to match first.
  const code = typeof body === "object" && body !== null && "name" in body
    ? (body as { name?: unknown }).name
    : undefined;
  const classificationText = [text, typeof code === "string" ? code : undefined]
    .filter(Boolean)
    .join(" ");

  const failure = classifyProviderFailure(
    typeof status === "number" ? status : undefined,
    classificationText || undefined,
  );

  console.error(`[${context}] provider call failed`, {
    failure,
    status: status ?? null,
    // The verbatim provider payload. This is the field that answers "what
    // exactly did they say", which is the question every provider
    // investigation starts with.
    body: body ?? null,
    message: text ?? null,
    currency: message.currency ?? null,
    // The error object itself last, so a stack is still available for a
    // failure that turned out not to be a provider refusal at all.
    error: err,
  });

  return customerMessageFor(failure, message);
}

/**
 * The same idea for a Postgres error coming back from an RPC, but it keeps the
 * messages we deliberately wrote for a human to read.
 *
 * Every money function in this schema raises its refusals with RAISE
 * EXCEPTION — "Your identity check is not approved", "That PIN is wrong",
 * "Your account type cannot be changed while your identity check is in
 * review". Those are customer copy that happens to live in SQL, and blanket
 * sanitising would replace a sentence that says exactly what to do with one
 * that says nothing.
 *
 * SQLSTATE P0001 (raise_exception) is precisely "a PL/pgSQL RAISE that named
 * no other condition" — i.e. one of ours. Everything else is the database
 * describing its own internals: a unique-constraint name, a type cast, a
 * null-violation naming a column. Those get the generic line, and the real
 * error goes to the logs.
 *
 * Deliberately conservative about length: a P0001 can still be a developer
 * message nobody edited (an assertion, say), and a wall of SQL in a red box
 * helps no one.
 */
export function toRpcError(
  error: { code?: string; message?: string } | null | undefined,
  context: string,
): string {
  console.error(`[${context}]`, error);

  const message = error?.message?.trim();
  if (error?.code === "P0001" && message && message.length <= 200) return message;

  return "We couldn't complete that right now. Please try again in a moment, or contact support if it continues.";
}
