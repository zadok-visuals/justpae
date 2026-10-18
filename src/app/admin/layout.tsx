import Link from "next/link";
import { requireAdminRoleOnly } from "@/lib/auth/admin";
import { Wordmark } from "@/components/layout/Mark";

const TABS = [
  { href: "/admin/kyc", label: "Verification" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/pay-to-china", label: "Pay to China" },
  { href: "/admin/rates", label: "Rates" },
  { href: "/admin/pnl", label: "Margin" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/users", label: "Accounts" },
  { href: "/admin/activity", label: "Activity" },
];

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
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminRoleOnly();

  return (
    <div className="min-h-screen-dvh bg-background">
      <header className="border-b border-border px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/admin"
              aria-label="justpae admin"
              className="-my-2 inline-flex min-h-11 items-center"
            >
              <Wordmark />
            </Link>
            <div className="flex items-center gap-3">
              {/* The role is shown because what an admin may do now differs by
                  it — a plain admin finds the grant controls absent rather
                  than broken, and seeing "admin" explains why. */}
              <Link
                href="/admin/security"
                className="-my-2 hidden min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground sm:inline-flex"
              >
                <span className="rounded-full bg-secondary px-2 py-0.5 font-mono">
                  {actor.role}
                </span>
                <span className="max-w-40 truncate">{actor.email}</span>
              </Link>
              <Link
                href="/home"
                // -my-2 keeps the 44px target from growing the header's height.
                className="-my-2 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground"
              >
                Back to app
              </Link>
            </div>
          </div>

          <nav aria-label="Admin" className="snap-rail -mx-1 flex gap-2 overflow-x-auto px-1">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                // min-h-11 / leading-11: 44px, the smallest a tap target should
                // be. These are the only way between admin queues on a phone.
                className="min-h-11 shrink-0 rounded-full border border-border bg-card px-4 text-sm font-medium leading-11 text-foreground"
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
