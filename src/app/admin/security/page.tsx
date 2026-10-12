import { requireAdminRoleOnly, adminMfaState } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Primitives";
import { MfaSetup } from "@/components/admin/MfaSetup";

export const metadata = { title: "Security · Admin" };
export const dynamic = "force-dynamic";

/**
 * The one admin page gated on role WITHOUT aal2 — see requireAdminRoleOnly.
 * It is how a session reaches aal2, so demanding aal2 to open it would be a
 * deadlock.
 */
export default async function AdminSecurityPage() {
  const actor = await requireAdminRoleOnly();

  const supabase = await createClient();
  const { enrolled, aal2 } = await adminMfaState(supabase);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factorId = (factors?.totp ?? [])[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {enrolled ? "Two-factor authentication" : "Set up two-factor authentication"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {enrolled
            ? "Required to open the admin tools."
            : "The admin tools can approve identity documents, release payouts and suspend accounts, so a password on its own isn't enough. This takes a minute and is a one-off."}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {actor.email} · {actor.role}
        </p>
      </div>

      <Card>
        <MfaSetup enrolled={enrolled} aal2={aal2} factorId={factorId} />
      </Card>
    </div>
  );
}
