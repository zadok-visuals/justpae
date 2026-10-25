import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { ActionTiles } from "@/components/home/ActionTiles";
import { HomeHeader } from "@/components/home/HomeHeader";
import { greetingFor } from "@/lib/home/greeting";
import { KycRow } from "@/components/home/KycRow";
import { PromoBanner } from "@/components/home/PromoBanner";
import { QuickServicesCard } from "@/components/home/QuickServicesCard";
import { TotalBalanceSection } from "@/components/home/TotalBalanceSection";
import { WalletsRow } from "@/components/home/WalletsRow";
import { RecentActivitySection } from "@/components/transactions/RecentActivitySection";
import { Skeleton } from "@/components/ui/Primitives";
import { KycPromptModal } from "@/components/kyc/KycPromptModal";
import { isKycPromptDismissed } from "@/lib/actions/kycPrompt";
import { startRouteTiming } from "@/lib/perf/timing";
import type { Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Home" };

/**
 * Home.
 *
 * Nothing is cached: a balance is exactly the thing a stale render must never
 * show.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GROUP 3 — WHAT THIS PAGE IS NOW, AND WHAT CAME OFF IT
 *
 * One blue card, one banner, four big tiles, then three bordered rows. What
 * went: the circle row of four "major actions" (the tiles say the same thing
 * and say what each one does), the swipeable rail of wallet cards (the same
 * money the total above it already reported, so it is one line to /accounts
 * now) and the rate board (it belongs on /convert, where a rate is something
 * you act on rather than something you read).
 *
 * WHAT THIS PAGE AWAITS. Only what it cannot draw without: the session, the
 * profile (the greeting and the KYC row) and the wallets — all single indexed
 * reads next door to the function. The total and the activity list each own
 * their read inside their own Suspense boundary and arrive in later chunks,
 * into skeletons already holding their space. The total is six provider round
 * trips; holding the whole screen for it would undo the reason it was moved
 * out.
 *
 * THE ORDER IS THE ORDER OF THE QUESTIONS: who am I, how much have I got,
 * what can I do with it, where is it, what just happened. On a phone that is
 * one column in exactly that sequence. From 1024px the last three move into
 * a second column (PageShell's `aside`), because they are reference rather
 * than action and neither half needs the other to make sense.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const endRouteTiming = startRouteTiming("/home");
  const supabase = await createClient();
  const user = await requireSessionUser();

  const [{ data: profile }, { data: wallets }, promptDismissed] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, kyc_status, kyc_rejection_reason, kyc_type, country")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("wallets").select("*").eq("user_id", user.id),
    isKycPromptDismissed(),
  ]);

  endRouteTiming();

  const fullName = profile?.full_name?.trim() ?? "";
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] ?? null;
  const walletList = (wallets ?? []) as Wallet[];

  // The modal is the one-time interrupt for the two statuses that still need
  // an action; `pending` has nothing to DO yet, so it keeps only the row.
  const showKycPrompt =
    (profile?.kyc_status === "not_started" || profile?.kyc_status === "rejected") &&
    !promptDismissed;

  return (
    <PageShell
      title={firstName ? `Hello, ${firstName}` : "Home"}
      width="split"
      mobileHeader={
        <HomeHeader
          initials={initialsFor(fullName || user.email || "?")}
          firstName={firstName}
          // The server's clock, corrected to the reader's on mount — see
          // HomeHeader for why it is passed rather than computed there.
          serverGreeting={greetingFor(new Date().getHours())}
        />
      }
      aside={
        <>
          <WalletsRow wallets={walletList} />
          <QuickServicesCard />
          <RecentActivitySection
            userId={user.id}
            title="Recent transactions"
            seeAllHref="/transactions"
          />
        </>
      }
    >
      <div className="space-y-4">
        <KycPromptModal
          initialOpen={showKycPrompt}
          rejectionReason={
            profile?.kyc_status === "rejected" ? profile?.kyc_rejection_reason ?? null : null
          }
        />

        <KycRow
          status={profile?.kyc_status}
          phone={profile?.phone}
          kycType={profile?.kyc_type}
        />

        <Suspense fallback={<Skeleton className="h-[8.5rem] w-full rounded-[20px]" />}>
          <TotalBalanceSection wallets={walletList} country={profile?.country} />
        </Suspense>

        <PromoBanner />

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">What do you need today?</h2>
          <ActionTiles />
        </section>
      </div>
    </PageShell>
  );
}

/** First letter of each of the first two words, "?" for nothing usable. */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
