/**
 * Never show a payment provider's own error text (or our env-var config
 * guards) to customers — it can name the provider directly, and its wording
 * isn't ours to control. This has happened for real: "BUSHA_API_KEY is not
 * configured" and raw provider error messages were rendered straight into a
 * deposit UI before a helper like this existed.
 *
 * Log the real error server-side (visible in the deployment logs) and return
 * one clean, provider-agnostic message to show instead.
 */
export function toCustomerError(err: unknown, context: string): string {
  console.error(`[${context}]`, err);
  return "We couldn't complete that right now. Please try again in a moment, or contact support if it continues.";
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
