import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { Wordmark } from "@/components/layout/Mark";

const TABS = [
  { href: "/admin/kyc", label: "Verification" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/rates", label: "Rates" },
  { href: "/admin/pnl", label: "Margin" },
];

/**
 * The admin shell.
 *
 * requireAdminUser here gates every admin PAGE. It does NOT gate the admin
 * actions — each of those calls it again itself, because a server action is
 * reachable by POST whether or not the layout that renders its form was ever
 * executed for that request.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminUser();

  return (
    <div className="min-h-screen-dvh bg-background">
      <header className="border-b border-border px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" aria-label="justpae admin">
              <Wordmark />
            </Link>
            <Link href="/home" className="text-sm font-medium text-muted-foreground">
              Back to app
            </Link>
          </div>

          <nav aria-label="Admin" className="snap-rail -mx-1 flex gap-2 overflow-x-auto px-1">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="min-h-9 shrink-0 rounded-full border border-border bg-card px-3 text-sm font-medium leading-9 text-foreground"
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
