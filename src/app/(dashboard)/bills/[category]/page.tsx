import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { BillForm } from "@/components/bills/BillForm";
import { EmptyState } from "@/components/ui/Primitives";
import { BILL_CATEGORIES, billersFor, isBillsAvailable } from "@/lib/providers/bills";
import { listBillers } from "@/lib/actions/bills";
import { countryName } from "@/lib/countries";
import type { BillCategory, Wallet } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = BILL_CATEGORIES.map((c) => c.value);

export async function generateMetadata(props: PageProps<"/bills/[category]">) {
  // Next.js 16: params is a Promise. Synchronous access was removed.
  const { category } = await props.params;
  const meta = BILL_CATEGORIES.find((c) => c.value === category);
  return { title: meta?.label ?? "Bills" };
}

export default async function BillCategoryPage(props: PageProps<"/bills/[category]">) {
  const [{ category }, search] = await Promise.all([props.params, props.searchParams]);

  if (!VALID_CATEGORIES.includes(category as BillCategory)) notFound();
  const billCategory = category as BillCategory;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallets }, { data: pin }] = await Promise.all([
    supabase.from("profiles").select("country").eq("id", user.id).maybeSingle(),
    supabase.from("wallets").select("*").eq("user_id", user.id),
    supabase.from("withdrawal_pins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  // Bills are country-scoped: the same biller code means nothing across
  // countries and the identifier formats differ. Defaults to the user's own
  // country, which is what the flow spec calls for.
  const country = profile?.country ?? "NG";
  const billers = await listBillers(country, billCategory);

  const meta = BILL_CATEGORIES.find((c) => c.value === billCategory)!;

  if (billers.length === 0) {
    return (
      <PageShell title={meta.label} back={{ href: "/bills", label: "Bills" }}>
        <EmptyState
          title={`No ${meta.label.toLowerCase()} billers in ${countryName(country)} yet`}
          body="We're adding more billers in each market. Try another category in the meantime."
          action={{ href: "/bills", label: "Back to bills" }}
        />
      </PageShell>
    );
  }

  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  // A saved-beneficiary link arrives with these, so a repeat payment is just
  // amount plus PIN. Validated against the real biller list rather than
  // trusted, since they come straight off the URL.
  const requestedBiller = first(search.biller);
  const initialBillerCode =
    requestedBiller && billersFor(country, billCategory).some((b) => b.code === requestedBiller)
      ? requestedBiller
      : undefined;

  return (
    <PageShell
      title={meta.label}
      subtitle={meta.blurb}
      back={{ href: "/bills", label: "Bills" }}
    >
      <BillForm
        category={billCategory}
        billers={billers}
        wallets={(wallets ?? []) as Wallet[]}
        hasPin={pin != null}
        available={isBillsAvailable()}
        initialBillerCode={initialBillerCode}
        initialIdentifier={first(search.identifier)}
      />
    </PageShell>
  );
}
