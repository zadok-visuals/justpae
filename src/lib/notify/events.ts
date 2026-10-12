import { createAdminClient } from "@/lib/supabase/admin";
import { formatAmount } from "@/lib/currencies";
import {
  sendDepositCreditedEmail,
  sendConversionCompletedEmail,
  sendWithdrawalCompletedEmail,
  sendWithdrawalFailedEmail,
} from "@/lib/email";
import type { Currency } from "@/lib/types/database";

/**
 * Server-only. "This happened to your money" — told to the user through both
 * channels at once: the in-app bell and an email.
 *
 * WHY THIS MODULE EXISTS. Each of these four events is committed in more than
 * one place. A deposit is credited by the Busha webhook, by the Klasha webhook
 * AND by the reconcile-deposits cron (the cron is the one that catches a
 * dropped webhook, so it is not a redundant path — it is the path that works
 * when the normal one didn't). A conversion completes in the convert action,
 * in the webhook and in the reconciler. A withdrawal completes in the webhook,
 * in the reconciler, in the automated-payout helper and in the admin queue.
 * Inlining "look up the email, format the amount, send" at all ten sites would
 * guarantee that some of them drift, and the ones that drift are the rarely-
 * exercised recovery paths — exactly the ones where the user most needs to be
 * told, because the normal path already failed once.
 *
 * ALL OF THESE ARE IDENTIFIED BY ROW ID, not by a bundle of pre-formatted
 * strings. The caller has a transaction id or a deposit id in hand at every
 * site; it does not always have the amount, the currency or the user's email,
 * and asking each caller to assemble those is how the formatting drifts.
 *
 * NEVER THROWS, and never changes the caller's outcome. The money has already
 * moved by the time any of these runs. A credited deposit must not report
 * failure because an email provider was down, and a webhook must not return
 * non-2xx — and so get retried, re-crediting nothing but re-sending
 * everything — because a notification insert failed. Each function catches
 * everything and logs it, so a persistently broken channel is visible rather
 * than silent.
 *
 * NO PROVIDER NAMES in anything composed here. Same rule as src/lib/email.ts.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * EXACTLY ONCE, across processes. See supabase/migrations/0018 for the full
 * reasoning; the short version is that each of these events is committed by up
 * to four separate paths (two webhook handlers, a cron, a server action), every
 * one of which is the path that works when the others are down. The money
 * functions are idempotent so a second completion is a no-op — but a
 * notification is not, and four "your deposit landed" emails for one deposit
 * reads to the customer as four credits.
 *
 * The four callers are four processes, so no in-process guard could see all of
 * them. The claim is one conditional UPDATE in the database, which returns true
 * to the first caller and false to every other.
 *
 * On an RPC error this returns FALSE, deliberately: if we cannot establish that
 * we are the first, we must assume we are not. A missing notification is a
 * support ticket; a duplicate one about someone's money is a scare.
 */
async function claim(
  admin: AdminClient,
  rpc: "claim_transaction_notification" | "claim_deposit_notification",
  args: Record<string, string>,
): Promise<boolean> {
  const { data, error } = await admin.rpc(rpc, args);
  if (error) {
    console.error("[notify.claim] failed", { rpc, args, error });
    return false;
  }
  return data === true;
}

/**
 * The in-app half. created_by is null: these are system events, and stamping
 * them with whichever admin happened to be in the room would be a false audit
 * trail. The column is nullable precisely for this.
 */
async function insertNotification(
  admin: AdminClient,
  userId: string,
  params: { title: string; body: string; href?: string },
): Promise<void> {
  const { error } = await admin.rpc("admin_send_notification", {
    p_user_id: userId,
    p_title: params.title,
    p_body: params.body,
    p_href: params.href ?? null,
    p_created_by: null,
  });
  if (error) console.error("[notify] notification insert failed", { userId, error });
}

async function emailFor(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  return data?.email ?? null;
}

/**
 * Enough of the payout destination to recognise, useless to anyone else
 * reading the same inbox — the same rule the recipient-changed email follows.
 * A full account number in an email is a gift to whoever has already
 * compromised that inbox.
 */
function maskedDestination(recipient: {
  bank_name: string | null;
  bank_account_number: string | null;
  wallet_address: string | null;
} | null): string | null {
  if (!recipient) return null;

  if (recipient.bank_account_number) {
    const last4 = recipient.bank_account_number.slice(-4);
    return recipient.bank_name ? `${recipient.bank_name} ••••${last4}` : `••••${last4}`;
  }
  if (recipient.wallet_address) {
    const addr = recipient.wallet_address;
    // First 6 and last 4 is the convention every wallet UI uses, and it is
    // what someone comparing against their own address will actually check.
    return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
  }
  return null;
}

/** A deposit landed in the user's wallet. */
export async function notifyDepositCredited(depositId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: deposit } = await admin
      .from("deposits")
      .select("user_id, currency, amount, confirmed_amount")
      .eq("id", depositId)
      .maybeSingle();
    if (!deposit) return;

    if (!(await claim(admin, "claim_deposit_notification", { p_deposit_id: depositId }))) return;

    // confirmed_amount is what actually arrived and is the only honest figure
    // to quote: a crypto deposit routinely settles a little under the amount
    // the user was quoted, and telling them the quote would make their own
    // balance look wrong.
    const currency = deposit.currency as Currency;
    const credited = deposit.confirmed_amount ?? deposit.amount;
    const amount = formatAmount(currency, credited);

    await insertNotification(admin, deposit.user_id, {
      title: `${currency} deposit received`,
      body: `${amount} is now in your ${currency} wallet.`,
      href: "/transactions",
    });

    const to = await emailFor(admin, deposit.user_id);
    if (to) await sendDepositCreditedEmail({ to, amount, currency });
  } catch (err) {
    console.error("[notify.notifyDepositCredited] threw", {
      depositId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/** A conversion settled. */
export async function notifyConversionCompleted(transactionId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: tx } = await admin
      .from("transactions")
      .select("user_id, amount, currency, target_currency, target_amount, actual_target_amount")
      .eq("id", transactionId)
      .maybeSingle();
    if (!tx || !tx.target_currency) return;

    // Claimed BEFORE the amount checks below, because a row that cannot be
    // described is still a row that has been handled — releasing the claim so
    // the next path can retry a description that will fail identically just
    // trades one silent miss for four.
    if (
      !(await claim(admin, "claim_transaction_notification", { p_transaction_id: transactionId }))
    ) {
      return;
    }

    const fromAmount = formatAmount(tx.currency as Currency, tx.amount);
    // actual_target_amount first: when the provider delivered something other
    // than the quote, that is what is in the wallet, and the email has to agree
    // with the wallet.
    const delivered = tx.actual_target_amount ?? tx.target_amount;
    if (delivered === null) return;
    const toAmount = formatAmount(tx.target_currency as Currency, delivered);

    await insertNotification(admin, tx.user_id, {
      title: "Conversion complete",
      body: `${fromAmount} became ${toAmount}.`,
      href: "/transactions",
    });

    const to = await emailFor(admin, tx.user_id);
    if (to) await sendConversionCompletedEmail({ to, fromAmount, toAmount });
  } catch (err) {
    console.error("[notify.notifyConversionCompleted] threw", {
      transactionId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/** A withdrawal was paid out. */
export async function notifyWithdrawalCompleted(transactionId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: tx } = await admin
      .from("transactions")
      .select("user_id, amount, currency")
      .eq("id", transactionId)
      .maybeSingle();
    if (!tx) return;

    if (
      !(await claim(admin, "claim_transaction_notification", { p_transaction_id: transactionId }))
    ) {
      return;
    }

    const currency = tx.currency as Currency;
    const amount = formatAmount(currency, tx.amount);

    const { data: recipient } = await admin
      .from("withdrawal_recipients")
      .select("bank_name, bank_account_number, wallet_address")
      .eq("user_id", tx.user_id)
      .eq("currency", currency)
      .maybeSingle();

    const destination = maskedDestination(recipient);

    await insertNotification(admin, tx.user_id, {
      title: "Withdrawal sent",
      body: destination
        ? `${amount} has been sent to ${destination}.`
        : `${amount} has been sent.`,
      href: "/transactions",
    });

    const to = await emailFor(admin, tx.user_id);
    if (to) await sendWithdrawalCompletedEmail({ to, amount, destination });
  } catch (err) {
    console.error("[notify.notifyWithdrawalCompleted] threw", {
      transactionId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * A withdrawal failed or was rejected, and the wallet has been refunded.
 *
 * The refund is the headline in both channels. "Your withdrawal failed" with
 * no word on where the money went is the most alarming message a fintech can
 * send, and it is the one that generates the support ticket this is supposed
 * to prevent.
 */
export async function notifyWithdrawalFailed(
  transactionId: string,
  reason: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: tx } = await admin
      .from("transactions")
      .select("user_id, amount, currency, decline_reason")
      .eq("id", transactionId)
      .maybeSingle();
    if (!tx) return;

    // Completed and failed are mutually exclusive terminal states, so one claim
    // per transaction covers both: whichever of the two happened is the one
    // thing the user is told about this row.
    if (
      !(await claim(admin, "claim_transaction_notification", { p_transaction_id: transactionId }))
    ) {
      return;
    }

    const amount = formatAmount(tx.currency as Currency, tx.amount);
    // The caller's reason wins when it has one — it is the immediate cause.
    // decline_reason is the fallback for a path that recorded it on the row
    // and then called here without repeating it.
    const shown = reason?.trim() || tx.decline_reason?.trim() || null;

    await insertNotification(admin, tx.user_id, {
      title: "Withdrawal returned",
      body: `${amount} has been put back into your wallet.${shown ? ` Reason: ${shown}` : ""}`,
      href: "/transactions",
    });

    const to = await emailFor(admin, tx.user_id);
    if (to) await sendWithdrawalFailedEmail({ to, amount, reason: shown });
  } catch (err) {
    console.error("[notify.notifyWithdrawalFailed] threw", {
      transactionId,
      error: err instanceof Error ? err.message : err,
    });
  }
}
