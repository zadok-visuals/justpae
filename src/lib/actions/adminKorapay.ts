"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser, logAdminActivity } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { toRpcError } from "@/lib/provider-error";
import { PAYOUT_ROUTE_SETTING_KEYS } from "@/lib/settings";
import { parsePayoutRoute } from "@/lib/withdrawals/route";

/**
 * Admin control over which provider pays each currency out.
 *
 * requireAdminUser() first, as every admin action in this codebase does: a
 * server action is reachable by POST whether or not the page that rendered
 * its form was gated, so this is the only gate that actually exists.
 *
 * The route is NOT a free-text setting. Whatever arrives is normalised to one
 * of two known values before it is stored, so a crafted submission can write
 * "korapay", "busha" or nothing else — anything unrecognised becomes Busha,
 * which is the safe direction for a value that decides where money leaves by.
 */

export interface PayoutRouteActionState {
  error?: string;
  ok?: boolean;
  message?: string;
}

const CURRENCIES = ["NGN", "KES"] as const;
type RoutableCurrency = (typeof CURRENCIES)[number];

function isRoutableCurrency(value: string): value is RoutableCurrency {
  return (CURRENCIES as readonly string[]).includes(value);
}

export async function setPayoutRoute(
  _prevState: PayoutRouteActionState,
  formData: FormData,
): Promise<PayoutRouteActionState> {
  const actor = await requireAdminUser();

  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  if (!isRoutableCurrency(currency)) {
    return { error: "Only naira and shilling payouts can be rerouted." };
  }

  // Normalised, never stored as submitted. See the header.
  const route = parsePayoutRoute(String(formData.get("route") ?? ""));

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_setting", {
    p_key: PAYOUT_ROUTE_SETTING_KEYS[currency],
    p_value: route,
    p_set_by: actor.id,
  });
  if (error) return { error: toRpcError(error, "admin") };

  await logAdminActivity({
    adminId: actor.id,
    action: "setting.payout_route",
    targetType: "setting",
    targetId: PAYOUT_ROUTE_SETTING_KEYS[currency],
    detail: { currency, route },
  });

  revalidatePath("/admin/rates");
  return {
    ok: true,
    message: `${currency} payouts now route through the ${route === "korapay" ? "secondary" : "primary"} provider.`,
  };
}
