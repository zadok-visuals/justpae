"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadActivityDetail, type ActivityDetailState } from "@/lib/activity/detail";
import type { ActivitySource } from "@/lib/transactions";

/**
 * The browser-reachable half of reading one activity row.
 *
 * Everything this file used to contain now lives in
 * src/lib/activity/detail.ts, which is a plain module. The split is a
 * security boundary, not tidying: the loader takes a `userId`, and an export
 * of a `"use server"` module that takes a `userId` is an endpoint anybody can
 * call with somebody else's. See the long note at the top of that file.
 *
 * What is left here is the one function the client component calls, and it
 * takes no id at all — it resolves the user itself, from getUser(), which is
 * the only id a browser caller is ever allowed to read as.
 */
export async function getActivityDetail(
  source: ActivitySource,
  id: string,
): Promise<ActivityDetailState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return loadActivityDetail(supabase, user.id, source, id);
}
