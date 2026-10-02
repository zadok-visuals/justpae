import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { Banner, SectionHeader, EmptyState } from "@/components/ui/Primitives";
import { BILL_CATEGORIES, isBillsAvailable } from "@/lib/providers/bills";
import { countryName } from "@/lib/countries";
import type { BillBeneficiary } from "@/lib/types/database";

export const metadata = { title: "Bills" };
export const dynamic = "force-dynamic";

/**
 * FEATURE 5 — the bills hub.
 *
 * Saved beneficiaries come FIRST, above the category grid. A repeat payment to
 * the same meter or phone number is by far the most common reason someone
 * opens this screen, and making them walk the category → biller → identifier
 * path again every month is the difference between a feature people use and
 * one they use once.
 */
export default async function BillsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: beneficiaries }] = await Promise.all([
    supabase.from("profiles").select("country").eq("id", user.id).maybeSingle(),
    supabase
      .from("bill_beneficiaries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const saved = (beneficiaries ?? []) as BillBeneficiary[];
  const available = isBillsAvailable();

  return (
    <PageShell
      title="Bills & airtime"
      subtitle={
        profile?.country
          ? `Paying in ${countryName(profile.country)}`
          : "Top up a phone or settle a bill."
      }
    >
      <div className="space-y-6">
        {!available && (
          <Banner tone="info" title="Bill payments are coming soon">
            We&apos;re finishing setup with our biller partner. Everything here is ready — you
            just can&apos;t pay yet.
          </Banner>
        )}

        {saved.length > 0 && (
          <section>
            <SectionHeader title="Pay again" />
            <ul className="space-y-2">
              {saved.slice(0, 5).map((beneficiary) => (
                <li key={beneficiary.id}>
                  <Link
                    href={`/bills/${beneficiary.category}?biller=${encodeURIComponent(
                      beneficiary.biller_code,
                    )}&identifier=${encodeURIComponent(beneficiary.customer_identifier)}`}
                    className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {beneficiary.label}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {beneficiary.biller_name} · {beneficiary.customer_identifier}
                      </span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-primary">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <SectionHeader title="What are you paying?" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {BILL_CATEGORIES.map((category) => (
              <Link
                key={category.value}
                href={`/bills/${category.value}`}
                className="flex min-h-24 flex-col justify-between rounded-xl border border-border bg-card p-4"
              >
                <span className="text-sm font-semibold text-foreground">{category.label}</span>
                <span className="text-xs text-muted-foreground">{category.blurb}</span>
              </Link>
            ))}
          </div>
        </section>

        {saved.length === 0 && available && (
          <EmptyState
            title="No saved billers yet"
            body="Save a meter or phone number after your first payment and it'll be one tap next time."
            action={{ href: "/bills/airtime", label: "Buy airtime" }}
          />
        )}
      </div>
    </PageShell>
  );
}
