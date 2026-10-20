import { getSuspension, requireSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { Banner } from "@/components/ui/Primitives";
import { BottomTabBar, Sidebar, TopBar } from "@/components/layout/DashboardChrome";
import { PageTitleProvider } from "@/components/layout/PageTitleContext";
import { UnreadCountsProvider } from "@/components/layout/UnreadCountsContext";
import { getUnreadCounts } from "@/lib/actions/unread";

/**
 * The suspension banner is PURELY the explanation, never the enforcement.
 * What actually stops a suspended account moving money is a BEFORE INSERT
 * trigger on transactions, bill_payments and deposits (migration 0019), which
 * fires for the service role and inside every security-definer money function
 * alike. The banner exists so a suspended user reads a reason here instead of
 * opening a support thread whose first line is "my app is broken".
 *
 * getSuspension reads the user's own profile row under their own RLS — the
 * existing "profiles: read own" policy covers it, so no service-role client
 * and no new grant — and is memoised per request, so a page that also needs
 * the profile does not read it a second time.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // THE authoritative check, and now the only auth round trip in the render.
  //
  // The proxy verifies the session's JWT locally and routes on it; this is
  // the real getUser() that the proxy's cheaper check is allowed to lean on,
  // and it carries the email-confirmation funnel that a JWT cannot answer
  // honestly. Memoised via React cache(), so every page under this layout
  // calls the same helper and shares this one call rather than making its
  // own — which is what three separate getUser()s per page view used to be.
  const user = await requireSessionUser();

  // user_metadata.full_name is set at signup (see signUp in lib/actions/auth)
  // and costs nothing extra to read — it's already on the session, unlike a
  // profiles-table lookup, which every page that wants it does on its own.
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";

  // Two cheap RPC counts (both auth.uid()-scoped anti-joins, see migration
  // 0017), fetched HERE rather than in each bar because this layout renders
  // once per request while MobileTopBar is mounted by every page's own
  // PageShell. Either failing resolves to 0 inside the action rather than
  // throwing — the header must render even when a count doesn't.
  //
  // GROUP 11b: one action for both counts rather than two. The pair used to be
  // two entries in this Promise.all, which costs nothing extra here, but the
  // badge poller added in UnreadCountsProvider calls the same code on a timer
  // where every tick is a fresh request — and there the two would have been
  // two auth round trips instead of one. Same definition on both sides, so the
  // polled number and the rendered one cannot drift.
  const [unread, admin, suspension] = await Promise.all([
    getUnreadCounts(),
    isAdmin(user.id, user.email),
    getSuspension(user.id),
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
      <UnreadCountsProvider counts={unread}>
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
