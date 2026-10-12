import { requireAdminUser } from "@/lib/auth/admin";
import { listSuspendedUsers } from "@/lib/actions/adminUsers";
import { UserAdmin } from "@/components/admin/UserAdmin";

export const metadata = { title: "Accounts · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const actor = await requireAdminUser();
  const suspended = await listSuspendedUsers();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suspending an account stops new deposits, conversions, bill payments and withdrawals. It
          never touches money already in flight — a refund or a payout already with the provider
          still completes.
        </p>
      </div>

      <UserAdmin
        isSuperadmin={actor.role === "superadmin"}
        suspended={suspended}
        currentAdminId={actor.id}
      />
    </div>
  );
}
