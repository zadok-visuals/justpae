"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KORAPAY_NGN_DEPOSIT } from "@/lib/flags";
import { getNgnVirtualAccount, type VirtualAccountState } from "@/lib/korapay/virtualAccount";

/**
 * Issuing a naira account number on demand.
 *
 * The page issues one by itself when naira is the currency being deposited
 * into. This covers the two cases it cannot: a customer who switched to naira
 * after the page rendered, and one who has just saved their BVN and should
 * not have to reload to see the result.
 *
 * THE USER ID COMES FROM getUser(), never from the form. There is no
 * parameter on this action at all, which is the strongest version of that
 * rule — there is nothing a crafted POST could put in it.
 *
 * THE FLAG IS RE-CHECKED HERE. A server action is reachable by POST whether
 * or not the screen that rendered its button was gated, so a deployment with
 * the naira rail switched off must refuse rather than quietly issue an
 * account number nothing will ever credit.
 */

export interface IssueVirtualAccountState {
  error?: string;
  result?: VirtualAccountState;
}

export async function issueNgnVirtualAccount(): Promise<IssueVirtualAccountState> {
  if (!KORAPAY_NGN_DEPOSIT) {
    return { error: "Naira account numbers aren't switched on yet." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await getNgnVirtualAccount(user.id);

  revalidatePath("/deposit");
  return { result };
}
