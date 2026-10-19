import { requireAdminRoleOnly } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminNav, type AdminNavCounts } from "@/components/admin/AdminNav";
import type { AdminDashboardStats } from "@/lib/types/database";

/**
 * The admin shell.
 *
 * WHY THIS USES THE ROLE-ONLY GATE. requireAdminUser additionally demands
 * aal2, and redirects to /admin/security when the session has not presented a
 * code. /admin/security is inside this layout — so gating the layout on aal2
 * would redirect it to itself, forever. The layout therefore checks only that
 * the session is an admin, and every PAGE under it calls requireAdminUser for
 * the second factor.
 *
 * That is not a weakening, because the layout was never the gate in the first
 * place: a server action is reachable by POST whether or not the layout that
 * rendered its form ever executed, so each action has always had to call the
 * gate itself. The proxy separately bounces any /admin path except
 * /admin/security when the session is not aal2 — three independent checks, of
 * which the one inside each action is the one that actually holds.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GROUP 6b — A SIDEBAR, NOT A SCROLLING PILL ROW
 *
 * See src/components/admin/AdminNav.tsx for what the pill row got wrong and
 * why none of the obvious patches fixed it. What changes HERE is the page
 * frame: the shell is now a full-height flex row (sidebar beside content)
 * rather than a header stacked above content, and the content column gets the
 * width the sidebar leaves rather than a fixed max-w-5xl in the middle of the
 * window.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminRoleOnly();

  return (
    <div className="flex min-h-screen-dvh bg-background">
      <AdminNav counts={await loadQueueCounts()} role={actor.role} email={actor.email} />

      {/* min-w-0 is load-bearing beside a flex sidebar: without it a wide
          admin table sets the flex item's minimum content size and pushes the
          whole layout sideways, which is the one overflow bug this frame can
          introduce that the old stacked header could not. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

const ZERO_COUNTS: AdminNavCounts = {
  verification: 0,
  withdrawals: 0,
  payToChina: 0,
  support: 0,
};

/**
 * The four queue depths for the sidebar badges.
 *
 * TWO QUERIES, IN PARALLEL, ON EVERY ADMIN PAGE RENDER — which is a cost
 * worth naming rather than hiding:
 *
 *   admin_dashboard_stats()   one round trip for every count the dashboard
 *                             already reads. Three of the four come from it,
 *                             so this is not a new query shape, it is the
 *                             same one the landing page makes.
 *   a head-count on the RMB queue, because pay_to_china's pending depth is
 *   the one the RPC does not return. `head: true` sends no rows.
 *
 * FAILS SOFT, DELIBERATELY. A badge is an affordance, not a record: if either
 * read fails the nav renders with no badges and every link still works. The
 * alternative — letting this throw — would take down all thirteen admin pages
 * because a count did not load, including /admin/security, which is the page
 * an admin needs when something else is broken.
 */
async function loadQueueCounts(): Promise<AdminNavCounts> {
  try {
    const admin = createAdminClient();

    const [{ data, error }, { count, error: rmbError }] = await Promise.all([
      admin.rpc("admin_dashboard_stats"),
      admin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("type", "pay_to_china")
        .eq("status", "pending"),
    ]);

    if (error) console.error("[admin.layout] queue counts failed", error);
    if (rmbError) console.error("[admin.layout] RMB queue count failed", rmbError);

    const stats = (data as AdminDashboardStats | null) ?? null;

    return {
      verification: stats?.kyc_pending ?? 0,
      // The queue plus the ones held for extra verification: both are rows a
      // person has to look at, and splitting them in the badge would
      // understate the work waiting behind one link.
      withdrawals: (stats?.withdrawals_queued ?? 0) + (stats?.withdrawals_flagged ?? 0),
      payToChina: count ?? 0,
      support: stats?.support_unread ?? 0,
    };
  } catch (err) {
    console.error("[admin.layout] queue counts threw", err);
    return ZERO_COUNTS;
  }
}
