import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { Banner } from "@/components/ui/Primitives";
import { BottomTabBar, Sidebar, TopBar } from "@/components/layout/DashboardChrome";
import { PageTitleProvider } from "@/components/layout/PageTitleContext";
import { UnreadCountsProvider } from "@/components/layout/UnreadCountsContext";
import { getUnreadNotificationCount } from "@/lib/actions/notifications";
import { getUnreadSupportCount } from "@/lib/actions/support";

/**
 * The user's own suspension state, read under their own RLS — the existing
 * "profiles: read own" policy already covers it, so this needs no service-role
 * client and no new grant.
 *
 * This banner is PURELY the explanation, never the enforcement. What actually
 * stops a suspended account moving money is a BEFORE INSERT trigger on
 * transactions, bill_payments and deposits (migration 0019), which fires for
 * the service role and inside every security-definer money function alike. The
 * banner exists so a suspended user reads a reason here instead of opening a
 * support thread whose first line is "my app is broken".
 */
async function suspensionFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ at: string; reason: string | null } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("suspended_at, suspended_reason")
    .eq("id", userId)
    .maybeSingle();

  if (!data?.suspended_at) return null;
  return { at: data.suspended_at, reason: data.suspended_reason };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already redirects an anonymous request, but this is checked
  // again here because the layout reads the user — a layout that assumes a
  // session the proxy happened to allow through is a layout that crashes the
  // first time the matcher changes.
  if (!user) redirect("/login");

  // Same reasoning for the confirmation gate the proxy also applies: an
  // unconfirmed session should never render the dashboard, proxy matcher
  // notwithstanding.
  if (!user.email_confirmed_at) {
    redirect(`/auth/verify?email=${encodeURIComponent(user.email ?? "")}`);
  }

  // user_metadata.full_name is set at signup (see signUp in lib/actions/auth)
  // and costs nothing extra to read — it's already on the session, unlike a
  // profiles-table lookup, which every page that wants it does on its own.
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";

  // Two cheap RPC counts (both auth.uid()-scoped anti-joins, see migration
  // 0017), fetched in parallel because neither depends on the other, and
  // fetched HERE rather than in each bar because this layout renders once per
  // request while MobileTopBar is mounted by every page's own PageShell.
  // Either failing resolves to 0 inside the action rather than throwing — the
  // header must render even when a count doesn't.
  const [unreadNotifications, unreadSupport, admin, suspension] = await Promise.all([
    getUnreadNotificationCount(),
    getUnreadSupportCount(),
    isAdmin(user.id, user.email),
    suspensionFor(supabase, user.id),
  ]);

  return (
    // h-screen-dvh (height: 100dvh), not min-h-screen-dvh: this shell's
    // height is CAPPED to the viewport on purpose, so the sidebar — a flex
    // child with no scroll logic of its own — is bounded to that same height
    // instead of stretching to match whatever height a tall page gives the
    // row. A min-height only sets a floor; it doesn't stop the row from
    // growing past the viewport when the page is long, which is exactly what
    // let the sidebar scroll away with the page before. overflow-hidden on
    // the outer shell plus overflow-y-auto on the content column below is
    // what actually does the pinning; the cap just makes that possible.
    <PageTitleProvider>
      {/* Wraps children too, not just TopBar: the mobile bar is rendered by
          each page's PageShell, which is inside children. */}
      <UnreadCountsProvider
        counts={{ notifications: unreadNotifications, support: unreadSupport }}
      >
        <div className="flex h-screen-dvh flex-col overflow-hidden bg-background">
          <TopBar userName={fullName} />

          <div className="flex min-h-0 flex-1">
            <Sidebar isAdmin={admin} />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
              {/* The bottom padding is the tab bar's own height plus the safe area.
                  Without it the last row of every scrolling page is permanently
                  hidden behind the bar — which is the single most common bug in a
                  bottom-tab layout. Dropped at sm, where there is no bar. */}
              <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
                {suspension && (
                  // Inside main and above children, so it is the first thing
                  // read on every page rather than something only the home
                  // screen mentions.
                  <div className="mx-auto w-full max-w-2xl px-4 pt-5 sm:px-6 sm:pt-8">
                    <Banner
                      tone="danger"
                      title="Your account is suspended"
                      action={{ href: "/support", label: "Message support" }}
                    >
                      {suspension.reason ??
                        "Deposits, conversions, bill payments and withdrawals are paused on this account."}
                    </Banner>
                  </div>
                )}
                {children}
              </main>
            </div>
          </div>

          <BottomTabBar />
        </div>
      </UnreadCountsProvider>
    </PageTitleProvider>
  );
}
