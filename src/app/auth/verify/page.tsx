import { redirect } from "next/navigation";
import { Wordmark } from "@/components/layout/Mark";
import { VerifyCodeForm } from "@/components/auth/VerifyCodeForm";
import { createClient } from "@/lib/supabase/server";
import { resolvePendingVerificationEmail } from "@/lib/auth/pendingEmail";

export const metadata = { title: "Verify your email" };

export default async function VerifyPage() {
  const supabase = await createClient();
  const email = await resolvePendingVerificationEmail(supabase);

  // Reachable only with a session or a pending-email cookie to check against
  // — a direct hit with neither means there is no signup in progress, so
  // back to the start rather than a code field with nothing to verify.
  if (!email) redirect("/signup");

  return (
    <div className="flex min-h-screen-dvh flex-col bg-background">
      <header className="flex items-center px-5 pb-2 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
        <Wordmark />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-4 sm:items-center sm:pt-0">
        <VerifyCodeForm email={email} />
      </main>
    </div>
  );
}
