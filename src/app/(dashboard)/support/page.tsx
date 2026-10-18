import { PageShell } from "@/components/layout/PageShell";
import { SupportChat } from "@/components/support/SupportChat";
import { loadMySupportThread } from "@/lib/actions/support";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Support" };

// The thread must be current on every visit — a cached support page is a page
// that hides the reply the user came to read.
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await requireSessionUser();

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
