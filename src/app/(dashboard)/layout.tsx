import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { BottomTabBar, Sidebar } from "@/components/layout/DashboardChrome";

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

  return (
    // dvh, not vh: 100vh is the height with the browser chrome collapsed, so
    // on load a 100vh shell overflows by the URL bar's height and the bottom
    // tab bar sits below the fold.
    <div className="flex min-h-screen-dvh bg-background">
      <Sidebar isAdmin={isAdminEmail(user.email)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The bottom padding is the tab bar's own height plus the safe area.
            Without it the last row of every scrolling page is permanently
            hidden behind the bar — which is the single most common bug in a
            bottom-tab layout. Dropped at sm, where there is no bar. */}
        <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
          {children}
        </main>
      </div>

      <BottomTabBar />
    </div>
  );
}
