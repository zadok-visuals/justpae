import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordWebhookDelivery, markWebhookProcessed } from "@/lib/webhooks/record";
import { getTransfer } from "@/lib/busha/client";
import { verifyTransferMatchesRow } from "@/lib/transfers/verify";
import {
  notifyDepositCredited,
  notifyConversionCompleted,
  notifyWithdrawalCompleted,
  notifyWithdrawalFailed,
} from "@/lib/notify/events";
import { settleSellOrderForDeposit } from "@/lib/sellOrders/settle";

/**
 * Provider webhook receiver.
 *
 * THE CENTRAL RULE: the payload's own `status` NEVER moves money. It is a
 * "something may have happened, go and check" trigger and nothing more. Once a
 * matching row is found, the transfer is re-fetched from the provider's own API
 * and only THAT status is acted on.
 *
 * This is not paranoia. Trusting the body's status is a live money bug: anyone
 * who knows or guesses a provider_reference can POST a forged
 * `funds_delivered` and have a wallet credited with nothing paid. With
 * re-verification, a forged payload can still reach this handler but cannot
 * move a cent unless the provider independently confirms it.
 *
 * SIGNATURE VERIFICATION, and why a mismatch is logged rather than rejected by
 * default: `x-bu-signature` carrying base64(HMAC-SHA256(secret, rawBody)) was
 * established by reverse-engineering real captured deliveries, not from
 * published documentation. The predecessor of this file checked a GUESSED
 * header name, and because a secret was configured, every single real delivery
 * was rejected with 401 before it was even logged — the webhook table stayed
 * empty for months and no deposit was ever credited by webhook. Nobody noticed
 * until users reported missing money.
 *
 * So the default here is: log a mismatch loudly, keep processing, and rely on
 * provider re-verification for actual safety. Set
 * BUSHA_WEBHOOK_REJECT_INVALID_SIGNATURE=true to reject once the scheme is
 * independently confirmed, or once enough real traffic has passed with no
 * logged mismatch.
 *
 * Every delivery is recorded in webhook_events and every processed one stamps
 * processed_at, so "did this fire, and what did it do" is answerable from the
 * table alone rather than only when a user complains.
 */

function verifySignature(rawBody: string, signatureHeader: string | null): boolean | null {
  const secret = process.env.BUSHA_WEBHOOK_SECRET;
  if (!secret) return null; // No secret configured — check disabled, not failed.
  if (!signatureHeader) return false;

  const expected = Buffer.from(
    createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"),
  );
  const actual = Buffer.from(signatureHeader);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const admin = createAdminClient();

  const signatureValid = verifySignature(rawBody, request.headers.get("x-bu-signature"));

  if (signatureValid === false) {
    // Header NAMES only, never their values: a signature header is itself
    // sensitive, and the name is the part that reveals a scheme change.
    const headerNames = [...request.headers.keys()];
    console.error("[busha webhook] signature did not match", { headerNames });

    if (process.env.BUSHA_WEBHOOK_REJECT_INVALID_SIGNATURE === "true") {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let payload: { data?: { id?: string; status?: string; category?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // An unparseable body is still recorded — it is diagnostic signal, and
    // returning an error would only make the provider retry it forever.
    console.error("[busha webhook] unparseable body");
    // No key: there is nothing in a body we could not read to key on. Recorded
    // anyway — an unparseable delivery is exactly the thing worth evidence of.
    await recordWebhookDelivery(admin, {
      provider: "busha",
      eventType: "unparseable",
      eventKey: null,
      payload: { _rawBody: rawBody.slice(0, 4000) },
      processed: true,
    });
    return NextResponse.json({ received: true });
  }

  const providerReference = payload.data?.id;
  const status = payload.data?.status;
  const category = payload.data?.category;

  // The delivery's identity. The provider's own transfer id plus the status it
  // is reporting: a genuine transition from processing to completed is a NEW
  // event and must get through, while a redelivery of the same transition is
  // the same event and must not.
  const eventKey = providerReference ? `${providerReference}:${status ?? "unknown"}` : null;

  const record = await recordWebhookDelivery(admin, {
    provider: "busha",
    eventType: category ?? "unknown",
    eventKey,
    payload: { ...payload, _signatureValid: signatureValid } as Record<string, unknown>,
  });

  // Acknowledged with a 200, not refused: a non-2xx is read as "retry", which
  // turns one duplicate into a queue of them.
  if (record.duplicate) return NextResponse.json({ received: true, duplicate: true });

  if (!providerReference || !status) {
    console.warn("[busha webhook] no id/status to act on", { eventId: record.id });
    await markWebhookProcessed(admin, record.id);
    return NextResponse.json({ received: true });
  }

  if (category === "deposit") {
    await handleDeposit(admin, providerReference, record.id ?? undefined);
  } else {
    await handleTransfer(admin, providerReference, status, record.id ?? undefined);
  }

  await markWebhookProcessed(admin, record.id);
  return NextResponse.json({ received: true });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function handleDeposit(
  admin: AdminClient,
  providerReference: string,
  eventId: string | undefined,
) {
  const { data: deposit } = await admin
    .from("deposits")
    .select("id, status, currency")
    .eq("provider", "busha")
    .eq("provider_reference", providerReference)
    .maybeSingle();

  if (!deposit) {
    console.error("[busha webhook] no matching deposit row", { eventId, providerReference });
    return;
  }
  if (deposit.status !== "pending") return;

  // The payload's amount fields are not acted on either. The transfer object
  // self-corrects to what actually arrived: a 10 USDT request can land as 12,
  // and crediting the requested figure short-changes the user by the
  // difference.
  let transferStatus: string | null = null;
  let actualAmount: number | null = null;
  try {
    const transfer = await getTransfer(providerReference);

    // A deposit's AMOUNT legitimately differs from the request — a 10 USDT
    // request can land as 12, and crediting the requested figure would
    // short-change the user. So only the currency is checked here, not the
    // amount: crediting a USDT arrival into an NGN wallet is never a
    // self-correction, it is a mismatch.
    const arrivedCurrency = transfer.target_currency?.trim().toUpperCase();
    if (arrivedCurrency && arrivedCurrency !== deposit.currency) {
      console.error("[busha webhook] deposit currency mismatch, taking no action", {
        eventId,
        depositId: deposit.id,
        rowCurrency: deposit.currency,
        transferCurrency: arrivedCurrency,
      });
      return;
    }

    transferStatus = transfer.status;
    actualAmount = Number(transfer.target_amount);
  } catch (err) {
    console.error("[busha webhook] could not re-fetch transfer", {
      eventId,
      providerReference,
      error: err instanceof Error ? err.message : err,
    });
    // Without confirmation from the provider, nothing happens. The reconcile
    // cron and the user-facing poll will both try again.
    return;
  }

  if (transferStatus === "funds_received") {
    const { error } = await admin.rpc("credit_deposit", {
      p_deposit_id: deposit.id,
      p_actual_amount: actualAmount,
    });
    if (error) {
      console.error("[busha webhook] credit_deposit failed", {
        eventId,
        depositId: deposit.id,
        error,
      });
    } else {
      // Only on success, and only after it: the notification says the money is
      // in the wallet, so it must not be sent when the credit didn't happen.
      // notifyDepositCredited never throws, so this cannot turn a successful
      // credit into a non-2xx that gets the whole webhook retried.
      await notifyDepositCredited(deposit.id);
      // A no-op for an ordinary deposit; for one funding a sell order, this
      // is the exactly-once settlement. Never throws — see settle.ts.
      await settleSellOrderForDeposit(deposit.id, actualAmount);
    }
  } else if (transferStatus === "cancelled" || transferStatus === "funds_not_delivered") {
    const { error } = await admin.rpc("fail_deposit", {
      p_deposit_id: deposit.id,
      p_reason: `Provider reported ${transferStatus}`,
    });
    if (error) {
      console.error("[busha webhook] fail_deposit failed", {
        eventId,
        depositId: deposit.id,
        error,
      });
    }
  }
}

async function handleTransfer(
  admin: AdminClient,
  providerReference: string,
  payloadStatus: string,
  eventId: string | undefined,
) {
  const terminalish =
    payloadStatus === "funds_converted" ||
    payloadStatus === "funds_delivered" ||
    payloadStatus === "funds_not_delivered" ||
    payloadStatus === "cancelled";

  if (!terminalish) return;

  const { data: transaction } = await admin
    .from("transactions")
    // Amounts and currencies, because the provider's status alone is no longer
    // enough to complete a row — see src/lib/transfers/verify.ts.
    // Including the 0024 leg trail: a two-leg conversion's provider_reference
    // is leg 2's, and leg 2's source is USDT, not the row's own currency.
    // verifyTransferMatchesRow cannot tell a correct bridged conversion from
    // somebody else's transfer without it.
    .select(
      "id, type, status, needs_manual_review, amount, currency, target_currency, target_amount, raw_target_amount, markup_rate, bridge_currency, leg1_provider_reference, leg2_provider_reference, leg1_target_amount",
    )
    .eq("provider", "busha")
    .eq("provider_reference", providerReference)
    .maybeSingle();

  if (!transaction) {
    console.error("[busha webhook] no matching transaction", {
      eventId,
      providerReference,
      payloadStatus,
    });
    return;
  }
  if (transaction.status !== "pending" && transaction.status !== "processing") return;
  // Already waiting for a human. A webhook retry must not re-litigate it.
  if (transaction.needs_manual_review) return;

  const isWithdrawal = transaction.type === "withdrawal";

  try {
    const transfer = await getTransfer(providerReference);

    // Re-fetching the transfer proves it is real and finished. This proves it
    // is THIS row's transfer. Both are needed: a forged payload can name a
    // reference, and a row can have been created pointing at a reference that
    // was never its own.
    const match = verifyTransferMatchesRow(transaction, transfer);
    if (!match.matches) {
      console.error("[busha webhook] provider transfer does not match row", {
        eventId,
        transactionId: transaction.id,
        providerReference,
        reason: match.reason,
      });
      await admin.rpc("flag_transaction_for_review", {
        p_transaction_id: transaction.id,
        p_reason: match.reason ?? "Provider transfer does not match this row",
      });
      return;
    }

    if (transfer.status === "funds_converted" || transfer.status === "funds_delivered") {
      const { error } = isWithdrawal
        ? await admin.rpc("complete_withdrawal_payout", { p_transaction_id: transaction.id })
        : await admin.rpc("complete_conversion", { p_transaction_id: transaction.id });
      if (error) {
        console.error("[busha webhook] completion failed", {
          eventId,
          transactionId: transaction.id,
          error,
        });
      } else if (isWithdrawal) {
        await notifyWithdrawalCompleted(transaction.id);
      } else {
        await notifyConversionCompleted(transaction.id);
      }
    } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
      const reason = `Provider reported ${transfer.status}`;
      const { error } = isWithdrawal
        ? await admin.rpc("fail_withdrawal_payout", {
            p_transaction_id: transaction.id,
            p_reason: reason,
          })
        : await admin.rpc("fail_conversion", {
            p_transaction_id: transaction.id,
            p_reason: reason,
          });
      if (error) {
        console.error("[busha webhook] failure handling failed", {
          eventId,
          transactionId: transaction.id,
          error,
        });
      } else if (isWithdrawal) {
        // Withdrawals only. fail_withdrawal_payout refunds the wallet, which is
        // the fact this tells the user about. A failed conversion leaves the
        // balance where it was, so there is nothing to reassure them about and
        // no email for it — see src/lib/email.ts on not inventing messages.
        await notifyWithdrawalFailed(transaction.id, reason);
      }
    } else {
      // The payload claimed a terminal status and the provider's own API
      // disagrees. The API wins; nothing happens.
      console.warn("[busha webhook] payload claimed terminal, provider says in progress", {
        eventId,
        transactionId: transaction.id,
        payloadStatus,
        actualStatus: transfer.status,
      });
    }
  } catch (err) {
    console.error("[busha webhook] could not verify transfer, taking no action", {
      eventId,
      transactionId: transaction.id,
      payloadStatus,
      error: err instanceof Error ? err.message : err,
    });
  }
}
