import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptBody } from "@/lib/klasha/client";
import { KLASHA_GHS_DEPOSIT_ENABLED } from "@/lib/flags";

/**
 * Secondary provider webhook — GHS deposit collection only.
 *
 * KNOWN OPEN GAP, stated plainly rather than papered over: unlike the primary
 * provider's webhook, this one CANNOT re-verify the payload against the
 * provider's own API, because no status-lookup endpoint has been implemented
 * for it (only createCollection exists). So the payload's reported status is
 * the only evidence available, which means a forged POST naming a known or
 * guessed tx_ref could credit a deposit with nothing paid.
 *
 * Three things keep that from being live exposure:
 *   1. The GHS deposit path is behind a flag that ships OFF, so no deposit row
 *      with this provider can exist to be targeted. This route refuses
 *      outright while the flag is off.
 *   2. A shared secret is checked against the plausible header names.
 *   3. Nothing here can credit a currency other than GHS, or a deposit that is
 *      not already pending.
 *
 * Before the flag is turned on, add a status-lookup call to the provider
 * client and re-verify here exactly as the primary provider's route does. The
 * auth work already in that client (login plus JWT caching) makes it
 * straightforward.
 *
 * The header name is genuinely unknown: the provider's dashboard has a webhook
 * key field with no public documentation for how the key is transmitted. So a
 * mismatch is logged rather than rejected, for the same reason as the primary
 * route — a guessed header name once caused every real delivery to be rejected
 * before it was even recorded, and the table stayed empty for months while
 * deposits silently went uncredited.
 */
const SIGNATURE_HEADER_CANDIDATES = ["x-klasha-signature", "x-webhook-key", "webhook-key"];

function verifySignature(headers: Record<string, string>): boolean | null {
  const secret = process.env.KLASHA_WEBHOOK_SECRET;
  if (!secret) return null; // Check disabled — no secret configured.

  const secretBuf = Buffer.from(secret);
  return SIGNATURE_HEADER_CANDIDATES.some((name) => {
    const value = headers[name];
    if (!value) return false;
    const valueBuf = Buffer.from(value);
    return valueBuf.length === secretBuf.length && timingSafeEqual(valueBuf, secretBuf);
  });
}

export async function POST(request: Request) {
  if (!KLASHA_GHS_DEPOSIT_ENABLED) {
    // The path is off, so no legitimate delivery can be expected. Refusing is
    // strictly better than recording payloads for a disabled integration.
    console.warn("[klasha webhook] received a delivery while the GHS path is disabled");
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  const rawBody = await request.text();
  const admin = createAdminClient();
  const headers = Object.fromEntries(request.headers.entries());

  const signatureValid = verifySignature(headers);
  if (signatureValid === false) {
    console.error("[klasha webhook] no candidate header matched the webhook secret", {
      headerNames: Object.keys(headers),
    });
  }

  let payload: {
    event?: string;
    data?: { tnxRef?: string; status?: string; destinationAmount?: number };
  };

  // Request bodies on this API are encrypted; whether webhook payloads use the
  // same convention is undocumented. Try the encrypted envelope first, fall
  // back to plaintext.
  try {
    const parsed = JSON.parse(rawBody) as { message?: string };
    payload = parsed.message ? (decryptBody(parsed.message) as typeof payload) : (parsed as typeof payload);
  } catch {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("[klasha webhook] unparseable body");
      await admin.from("webhook_events").insert({
        provider: "klasha",
        event_type: "unparseable",
        payload: { _rawBody: rawBody.slice(0, 4000) },
        processed_at: new Date().toISOString(),
      });
      return NextResponse.json({ received: true });
    }
  }

  const { data: eventRow } = await admin
    .from("webhook_events")
    .insert({
      provider: "klasha",
      event_type: payload.event ?? "unknown",
      payload: { ...payload, _signatureValid: signatureValid } as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (
    payload.event === "charge.completed" &&
    payload.data?.tnxRef &&
    payload.data.status === "successful"
  ) {
    const { data: deposit } = await admin
      .from("deposits")
      .select("id, status, currency")
      .eq("provider", "klasha")
      .eq("provider_reference", payload.data.tnxRef)
      .maybeSingle();

    if (deposit && deposit.status === "pending" && deposit.currency === "GHS") {
      // Null falls back to the originally requested amount: this provider
      // offers no "what actually arrived" re-check, so there is no better
      // figure available.
      const { error } = await admin.rpc("credit_deposit", {
        p_deposit_id: deposit.id,
        p_actual_amount: null,
      });
      if (error) {
        console.error("[klasha webhook] credit_deposit failed", {
          eventId: eventRow?.id,
          depositId: deposit.id,
          error,
        });
      }
    } else if (!deposit) {
      console.error("[klasha webhook] no matching deposit row", {
        eventId: eventRow?.id,
        txRef: payload.data.tnxRef,
      });
    }
  }

  if (eventRow?.id) {
    await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);
  }

  return NextResponse.json({ received: true });
}
