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
