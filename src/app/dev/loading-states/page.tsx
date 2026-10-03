import { notFound } from "next/navigation";
import HomeLoading from "@/app/(dashboard)/home/loading";
import TransactionsLoading from "@/app/(dashboard)/transactions/loading";
import ConvertLoading from "@/app/(dashboard)/convert/loading";
import BillsLoading from "@/app/(dashboard)/bills/loading";
import BillCategoryLoading from "@/app/(dashboard)/bills/[category]/loading";
import DepositLoading from "@/app/(dashboard)/deposit/loading";
import WithdrawLoading from "@/app/(dashboard)/withdraw/loading";
import ReceiveLoading from "@/app/(dashboard)/receive/loading";
import ProfileLoading from "@/app/(dashboard)/profile/loading";
import AdminLoading from "@/app/admin/loading";

/**
 * Development-only: every route's loading.tsx on one page.
 *
 * A route-level skeleton is normally visible for a few hundred milliseconds on
 * a fast connection, which is not long enough to check that its shape matches
 * the page it stands in for. Mounting them side by side is.
 *
 * Gated the same way /dev/gallery is — notFound() outside development, plus a
 * development-only allowance in the proxy.
 */

const STATES: [string, () => React.ReactNode][] = [
  ["/home", HomeLoading],
  ["/transactions", TransactionsLoading],
  ["/convert", ConvertLoading],
  ["/bills", BillsLoading],
  ["/bills/[category]", BillCategoryLoading],
  ["/deposit", DepositLoading],
  ["/withdraw", WithdrawLoading],
  ["/receive", ReceiveLoading],
  ["/profile", ProfileLoading],
  ["/admin", AdminLoading],
];

export default function DevLoadingStates() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="min-h-screen-dvh bg-background py-6">
      {STATES.map(([route, Component]) => (
        <section key={route} className="mb-8 border-t border-border pt-4">
          <p className="mb-2 px-4 font-mono text-xs uppercase tracking-wide text-primary sm:px-6">
            {route}
          </p>
          <Component />
        </section>
      ))}
    </div>
  );
}
