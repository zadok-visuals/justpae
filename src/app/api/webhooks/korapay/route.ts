import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordWebhookDelivery, markWebhookProcessed } from "@/lib/webhooks/record";
import { verifyKorapaySignature } from "@/lib/korapay/signature";
import { korapaySettleDeps } from "@/lib/korapay/deps";
import { settleKorapayCharge } from "@/lib/korapay/settle";

/**
 * Korapay's webhook receiver.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE SIGNATURE IS ENFORCED HERE, UNLIKE THE OTHER RECEIVER
 *
 * src/app/api/webhooks/busha/route.ts logs a signature mismatch and carries
 * on, behind a flag, and its header explains why: that scheme was
 * reverse-engineered from captured deliveries, and rejecting on a guess once
 * cost months of silently uncredited deposits.
 *
 * This scheme is published rather than guessed — see
 * src/lib/korapay/signature.ts — so an unsigned or wrongly signed delivery is
 * refused with a 401 and nothing is recorded, which is the correct default
 * for a receiver that can credit a wallet.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE PAYLOAD NEVER MOVES MONEY
 *
 * A valid signature proves the delivery came from the provider. It does not
 * prove the body is current — a replayed delivery is correctly signed — and
 * it says nothing about the amount. The charge is RE-QUERIED and only that
 * response is acted on; see src/lib/korapay/settle.ts, where that rule lives
 * so it can be tested.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * IT RETURNS 200 QUICKLY, AND ALMOST ALWAYS
 *
 * A non-2xx is read as "retry". Anything other than a bad signature — an
 * unknown account, a credit that failed — is recorded, logged and
 * acknowledged, because a retry would not fix any of them and the reconcile
 * cron covers the ones that are genuinely transient.
 */

export const dynamic = "force-dynamic";

type KorapayWebhookPayload = {
  event?: string;
  data?: { reference?: string; [key: string]: unknown };
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  let payload: KorapayWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Nothing is recorded for a body we cannot read, because nothing can be
    // verified about it either — recording unverified bodies is a free write
    // primitive for anybody who finds this URL.
    console.error("[korapay webhook] unparseable body");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const signed = verifyKorapaySignature(
    payload.data,
    request.headers.get("x-korapay-signature"),
    process.env.KORAPAY_SECRET_KEY,
  );

  if (!signed) {
    // Header NAMES only, never their values: a signature header is itself
    // sensitive, and the name is the part that reveals a scheme change.
    console.error("[korapay webhook] signature did not match", {
      headerNames: [...request.headers.keys()],
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const admin = createAdminClient();
  const event = payload.event ?? "unknown";
  const reference = payload.data?.reference;

  // The delivery's identity. The provider's own reference plus the event it
  // is reporting: a genuine transition from pending to success is a NEW event
  // and must get through, while a redelivery of the same one must not.
  const eventKey = reference ? `${reference}:${event}` : null;

  const record = await recordWebhookDelivery(admin, {
    provider: "korapay",
    eventType: event,
    eventKey,
    payload: payload as Record<string, unknown>,
  });

  // Acknowledged with a 200, not refused: a non-2xx is read as "retry", which
  // turns one duplicate into a queue of them.
  if (record.duplicate) return NextResponse.json({ received: true, duplicate: true });

  if (!reference) {
    console.warn("[korapay webhook] no reference to act on", { eventId: record.id, event });
    await markWebhookProcessed(admin, record.id);
    return NextResponse.json({ received: true });
  }

  if (event === "charge.success") {
    const outcome = await settleKorapayCharge(
      korapaySettleDeps(admin, `korapay webhook ${record.id ?? ""}`),
      reference,
    );
    await markWebhookProcessed(admin, record.id);
    return NextResponse.json({ received: true, outcome });
  }

  if (event === "charge.failed") {
    // Logged and nothing else. A failed pay-in has no row here to fail —
    // there is no deposit until money actually arrives — so the only useful
    // thing is a record that somebody tried.
    console.error("[korapay webhook] charge failed", { eventId: record.id, reference });
  }

  await markWebhookProcessed(admin, record.id);
  return NextResponse.json({ received: true });
}
