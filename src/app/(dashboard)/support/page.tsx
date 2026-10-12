import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { SupportChat } from "@/components/support/SupportChat";
import { loadMySupportThread } from "@/lib/actions/support";

export const metadata = { title: "Support" };

// The thread must be current on every visit — a cached support page is a page
// that hides the reply the user came to read.
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { messages, attachmentUrls } = await loadMySupportThread();

  return (
    <PageShell
      title="Support"
      subtitle="One thread, straight to our team. We answer here, and email you when we do."
    >
      <SupportChat userId={user.id} messages={messages} attachmentUrls={attachmentUrls} />
    </PageShell>
  );
}
