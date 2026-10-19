"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * "Tell me when this opens."
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THERE IS NO userId PARAMETER
 *
 * Every export of a `"use server"` module is an endpoint any browser with a
 * session can POST to. A `userId` argument on one of them is an invitation
 * to write a row as somebody else. The id comes from `getUser()` — the
 * authoritative call, not `getClaims()` — and from nowhere else.
 *
 * That is belt and braces here rather than the only lock: migration 0031's
 * RLS policies check `auth.uid() = user_id` on insert and delete, so the
 * database would refuse a forged id even if this function handed it one.
 * Both, because the policy is the thing that must hold and this is the
 * thing that makes the policy never need to.
 *
 * NO SERVICE-ROLE CLIENT. The user's own session can write their own row
 * under the policies above, so reaching for the service role would be
 * bypassing a working lock for no reason.
 */

export type FeatureInterestState = { ok?: boolean; error?: string };

/**
 * Features a user may register interest in. An allowlist, not free text:
 * `feature` is a text column, and without this the endpoint would accept
 * arbitrary strings from the browser and store them.
 */
const KNOWN_FEATURES = ["flights", "bills"] as const;
export type InterestFeature = (typeof KNOWN_FEATURES)[number];

function isKnownFeature(value: string): value is InterestFeature {
  return (KNOWN_FEATURES as readonly string[]).includes(value);
}

export async function setFeatureInterest(
  feature: string,
  interested: boolean,
): Promise<FeatureInterestState> {
  if (!isKnownFeature(feature)) {
    console.error("[featureInterest] refused an unknown feature", { feature });
    return { error: "We don't know that feature." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to be notified." };

  if (interested) {
    // upsert, not insert: the primary key is (user_id, feature), and a
    // double-tap must be idempotent rather than a unique-violation error
    // shown to someone who pressed a toggle twice.
    const { error } = await supabase
      .from("feature_interest")
      .upsert({ user_id: user.id, feature }, { onConflict: "user_id,feature" });
    if (error) {
      console.error("[featureInterest] insert failed", { feature, error });
      return { error: "We couldn't save that. Try again." };
    }
  } else {
    // There is no mutable column on the row, so turning the toggle off is a
    // delete. See the note in migration 0031 on why there is no update policy.
    const { error } = await supabase
      .from("feature_interest")
      .delete()
      .eq("user_id", user.id)
      .eq("feature", feature);
    if (error) {
      console.error("[featureInterest] delete failed", { feature, error });
      return { error: "We couldn't save that. Try again." };
    }
  }

  revalidatePath("/flights");
  revalidatePath("/bills");
  return { ok: true };
}
