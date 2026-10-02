import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/PasswordResetForms";

export const metadata = { title: "Set a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reaching this page without the recovery session /auth/confirm establishes
  // means the link expired or was never followed. Sending them back to request
  // a new one is more useful than a form whose submit is guaranteed to fail.
  if (!user) redirect("/forgot-password?expired=1");

  return <ResetPasswordForm />;
}
