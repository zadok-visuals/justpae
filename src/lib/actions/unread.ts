"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * GROUP 11b — the two header badge counts, in one round trip, pollable.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AT ALL
 *
 * The brief lists "unread badges" among the pollers that must pause when the
 * tab is hidden. Going to add that, I found there was no badge poller to
 * pause: the two counts are read once in the dashboard layout and published
 * through context, so the bell and the support link show whatever was true
 * when the page was last rendered.
 *
 * Which means a user sitting on /home — the screen they sit on — never learns
 * that support replied. The badge appears the next time they navigate, and if
 * they are waiting on an answer about money they are refreshing by hand,
 * which is the behaviour the support poller already exists to prevent one
 * screen deeper. So the honest version of this item is not "pause a poller",
 * it is "there should be one, and it should pause".
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY ONE ACTION AND NOT THE TWO THAT ALREADY EXISTED
 *
 * getUnreadNotificationCount() and getUnreadSupportCount() each open a client,
 * each call supabase.auth.getUser(), and each run one RPC. Called from a
 * Promise.all in a server render that has already resolved the user, the
 * duplicate auth call is free — Group 8 put getUser() behind cache() for the
 * request. Called from a POLLER, every tick is a NEW request with a new cache,
 * so the pair would cost two auth round trips and two RPCs every interval, on
 * every open tab, forever.
 *
 * This does one getUser and both RPCs in parallel: one round trip's latency
 * for both numbers, and half the auth calls. The layout uses it too, so there
 * is one definition of "the badge counts" rather than a server one and a
 * client one that can drift.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SECURITY
 *
 * Nothing here is privileged and nothing here moves money. Both RPCs are
 * `auth.uid()`-scoped by their own definitions in migration 0017 — they take
 * no parameters, so there is no user id for a caller to supply and no way to
 * ask for somebody else's counts. The client is the ordinary RLS-bound one,
 * never the service role. A signed-out caller gets zeroes.
 *
 * FAILS TO ZERO, NEVER THROWS. This is read by the chrome on every page and
 * now on a timer as well; a count that cannot be read must not take down the
 * header it renders in, and must not pop a toast on a tab somebody left open.
 */
export interface UnreadCounts {
  notifications: number;
  support: number;
}

const ZERO: UnreadCounts = { notifications: 0, support: 0 };

export async function getUnreadCounts(): Promise<UnreadCounts> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ZERO;

  const [notifications, support] = await Promise.all([
    supabase.rpc("unread_notification_count"),
    supabase.rpc("unread_support_count"),
  ]);

  if (notifications.error) {
    console.error("[unread.getUnreadCounts] notification count failed", notifications.error);
  }
  if (support.error) {
    console.error("[unread.getUnreadCounts] support count failed", support.error);
  }

  return {
    notifications: notifications.data ?? 0,
    support: support.data ?? 0,
  };
}
