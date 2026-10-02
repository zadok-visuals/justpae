"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveProvider,
  toReceivingDetails,
  type UsdReceivingDetails,
} from "@/lib/providers/usdCollection";
import { toCustomerError } from "@/lib/provider-error";

/**
 * FEATURE 1 — /receive.
 *
 * Reads or issues the user's USD receiving details. Nothing here credits a
 * balance: incoming USD is credited only by the verified provider webhook,
 * through credit_deposit, like every other deposit.
 */

export type ReceiveState =
  | { status: "unavailable"; reason: string }
  | { status: "ready"; details: UsdReceivingDetails }
  | { status: "error"; error: string };

/** A short, unambiguous code a sender quotes so a payment can be attributed. */
function generateReferenceCode(): string {
  // Crockford-ish alphabet: no I, L, O, U, so a code read over the phone or
  // copied off a bank form cannot be transcribed into a different valid one.
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(8);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `JP-${out}`;
}

export async function getReceivingDetails(): Promise<ReceiveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("usd_collection_accounts")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return { status: "ready", details: toReceivingDetails(existing) };

  const provider = resolveProvider();
  if (!provider) {
    return {
      status: "unavailable",
      reason:
        "Dollar receiving details are almost ready. We're finalising the account that will issue them, and you'll see your details here as soon as that's live.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  try {
    const issued = await provider.issueAccount({
      userId: user.id,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? user.email ?? "",
    });

    // The reference code is OURS. A provider that supplies one is used as-is;
    // otherwise one is generated here, because it is the only field guaranteed
    // to exist whatever shape the provider's details take.
    const referenceCode = issued.referenceCode || generateReferenceCode();

    const admin = createAdminClient();
    await admin.rpc("upsert_usd_collection_account", {
      p_user_id: user.id,
      p_provider: provider.name,
      p_reference_code: referenceCode,
      p_account_name: issued.accountName,
      p_account_number: issued.accountNumber,
      p_routing_number: issued.routingNumber,
      p_bank_name: issued.bankName,
      p_bank_address: issued.bankAddress,
      p_account_type: issued.accountType,
      p_status: issued.status,
    });

    revalidatePath("/receive");
    return { status: "ready", details: { ...issued, referenceCode } };
  } catch (err) {
    return { status: "error", error: toCustomerError(err, "receive.getReceivingDetails") };
  }
}
