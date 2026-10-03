import { redirect } from "next/navigation";
import { Wordmark } from "@/components/layout/Mark";
import { VerifyCodeForm } from "@/components/auth/VerifyCodeForm";

export const metadata = { title: "Verify your email" };

export default async function VerifyPage(props: PageProps<"/auth/verify">) {
  const { email } = await props.searchParams;
  const value = Array.isArray(email) ? email[0] : email;

  // Reachable only with an email in the URL — a direct hit with none means
  // there is no signup to verify, so back to the start rather than a blank
  // code field with nothing to check it against.
  if (!value) redirect("/signup");

  return (
    <div className="flex min-h-screen-dvh flex-col bg-background">
      <header className="flex items-center px-5 pb-2 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
        <Wordmark />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-4 sm:items-center sm:pt-0">
        <VerifyCodeForm email={value} />
      </main>
    </div>
  );
}
