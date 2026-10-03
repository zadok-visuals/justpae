import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { BottomTabBar, Sidebar, TopBar } from "@/components/layout/DashboardChrome";
import { PageTitleProvider } from "@/components/layout/PageTitleContext";

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
      <div className="flex h-screen-dvh flex-col overflow-hidden bg-background">
        <TopBar userName={fullName} />

        <div className="flex min-h-0 flex-1">
          <Sidebar isAdmin={isAdminEmail(user.email)} />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
            {/* The bottom padding is the tab bar's own height plus the safe area.
                Without it the last row of every scrolling page is permanently
                hidden behind the bar — which is the single most common bug in a
                bottom-tab layout. Dropped at sm, where there is no bar. */}
            <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
              {children}
            </main>
          </div>
        </div>

        <BottomTabBar />
      </div>
    </PageTitleProvider>
  );
}
