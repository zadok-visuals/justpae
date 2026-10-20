"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * GROUP 5. "Also send by email" — the Profile side of it.
 *
 * NO userId PARAMETER, same reasoning as setFeatureInterest: the id comes
 * from getUser(), never from an argument a browser could forge. The user's
 * own session writes their own row — migration 0035 grants `update
 * (email_announcements)` to authenticated, scoped by the existing "profiles:
 * update own" RLS policy, so there is no service-role client here either.
 *
 * SCOPE. This column, and only this action, controls the admin broadcast
 * composer's "also send by email" (src/lib/actions/notifications.ts).
 * Account and security email ignores it entirely and always sends.
 */
export type EmailPreferenceState = { ok?: boolean; error?: string };

export async function setEmailAnnouncementPreference(enabled: boolean): Promise<EmailPreferenceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to change this." };

  const { error } = await supabase
    .from("profiles")
    .update({ email_announcements: enabled })
    .eq("id", user.id);

  if (error) {
    console.error("[emailPreferences.setEmailAnnouncementPreference] failed", { error });
    return { error: "We couldn't save that. Try again." };
  }

  revalidatePath("/profile");
  return { ok: true };
}
