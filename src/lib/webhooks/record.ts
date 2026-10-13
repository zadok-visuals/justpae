import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Recording one webhook delivery, exactly once.
 *
 * Shared by both receivers so the duplicate rule is one rule rather than two
 * that drift. The uniqueness itself is a partial index in migration 0021 — the
 * check is in the database, not here, because two deliveries of the same event
 * genuinely can arrive at the same moment and a read-then-write in application
 * code would let both through.
 */

/** Postgres unique_violation. The insert losing this race IS the duplicate. */
const UNIQUE_VIOLATION = "23505";

export type WebhookRecord =
  | { duplicate: true; id: null }
  | { duplicate: false; id: string | null };

export async function recordWebhookDelivery(
  admin: SupabaseClient<Database>,
  params: {
    provider: string;
    eventType: string;
    /**
     * Per-delivery identity, built from the provider's OWN fields — a
     * transaction reference plus the event name, typically. Null when the
     * delivery carries nothing stable to key on, in which case it is recorded
     * and not deduplicated: an unparseable body is exactly the thing worth
     * having a record of, and dropping it to protect a uniqueness constraint
     * would lose the evidence.
     */
    eventKey: string | null;
    payload: Record<string, unknown>;
    /** Set when there is nothing further to do with this delivery. */
    processed?: boolean;
  },
): Promise<WebhookRecord> {
  const { data, error } = await admin
    .from("webhook_events")
    .insert({
      provider: params.provider,
      event_type: params.eventType,
      event_key: params.eventKey,
      payload: params.payload,
      processed_at: params.processed ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    // warn, not error: a redelivery is normal provider behaviour after a
    // timeout or an operator pressing "resend" — worth seeing in the log, not
    // worth paging anyone about.
    console.warn("[webhook] ignoring a delivery already recorded", {
      provider: params.provider,
      eventType: params.eventType,
      eventKey: params.eventKey,
    });
    return { duplicate: true, id: null };
  }

  if (error) {
    // NOT fatal to the handler. Failing to write the audit row must not stop a
    // deposit being credited, and must not return non-2xx — which the provider
    // would read as "retry", turning one storage hiccup into a retry storm.
    console.error("[webhook] could not record delivery", {
      provider: params.provider,
      eventType: params.eventType,
      error,
    });
    return { duplicate: false, id: null };
  }

  return { duplicate: false, id: data?.id ?? null };
}

/** Stamp a recorded delivery as finished. */
export async function markWebhookProcessed(
  admin: SupabaseClient<Database>,
  id: string | null,
): Promise<void> {
  if (!id) return;
  await admin
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", id);
}
