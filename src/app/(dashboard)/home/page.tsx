import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { MajorActions } from "@/components/home/MajorActions";
import { QuickServicesCard } from "@/components/home/QuickServicesCard";
import { TotalBalanceSection } from "@/components/home/TotalBalanceSection";
import { WalletCards } from "@/components/home/WalletCards";
import { RateBoardSection } from "@/components/rates/RateBoardSection";
import { RecentActivitySection } from "@/components/transactions/RecentActivitySection";
import { SectionHeader, Skeleton } from "@/components/ui/Primitives";
import { KycStatusBanner } from "@/components/kyc/KycStatusBanner";
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
 * WHAT THIS PAGE AWAITS. Only what it cannot draw without: the session, the
 * profile (the greeting and the KYC banner) and the wallets — all single
 * indexed reads next door to the function. The total, the rate board and the
 * activity list each own their read inside their own Suspense boundary and
 * arrive in later chunks, into skeletons already holding their space. The
 * total is six provider round trips; holding the whole screen for it would
 * undo the reason the other two were moved out.
 *
 * THE ORDER IS THE ORDER OF THE QUESTIONS: who am I, how much have I got,
 * what can I do with it, where is it, what does it cost today, what just
 * happened. On a phone that is one column in exactly that sequence. From
 * 1024px the last three move into a second column, because they are
 * reference rather than action and neither half needs the other to make
 * sense.
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

  // The modal is the one-time interrupt for the two statuses that still need
  // an action; `pending` has nothing to DO yet, so it keeps only the banner.
  const showKycPrompt =
    (profile?.kyc_status === "not_started" || profile?.kyc_status === "rejected") &&
    !promptDismissed;

  return (
    <PageShell
      title={firstName ? `Hello, ${firstName}` : "Home"}
      mobileLeading={
        <HomeGreeting initials={initialsFor(fullName || user.email || "?")} firstName={firstName} />
      }
      aside={
        <>
          {/* Wallets belong in the reference column from lg up, and directly
              under the action row below it. The two breakpoints want
              different ORDERS, not different content, and PageShell stacks
              the aside after the children — so the section is rendered in
              both places and each one hides itself at the other width. It is
              the same server component over the same rows either way. */}
          <section className="hidden lg:block">
            <SectionHeader title="Your wallets" action={{ href: "/accounts", label: "All accounts" }} />
            <WalletCards wallets={(wallets ?? []) as Wallet[]} />
          </section>

          <RateBoardSection variant="list" action={{ href: "/convert", label: "See all" }} />
          <RecentActivitySection userId={user.id} seeAllHref="/transactions" />
        </>
      }
    >
      <div className="space-y-5">
        <KycPromptModal
          initialOpen={showKycPrompt}
          rejectionReason={
            profile?.kyc_status === "rejected" ? profile?.kyc_rejection_reason ?? null : null
          }
        />

        <KycStatusBanner
          compact
          status={profile?.kyc_status}
          phone={profile?.phone}
          kycType={profile?.kyc_type}
          rejectionReason={profile?.kyc_rejection_reason}
        />

        <Suspense fallback={<Skeleton className="h-[8.5rem] w-full rounded-2xl" />}>
          <TotalBalanceSection
            wallets={(wallets ?? []) as Wallet[]}
            country={profile?.country}
          />
        </Suspense>

        <MajorActions />

        <section className="lg:hidden">
          <SectionHeader title="Your wallets" action={{ href: "/accounts", label: "All accounts" }} />
          <WalletCards wallets={(wallets ?? []) as Wallet[]} />
        </section>

        <QuickServicesCard />
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
