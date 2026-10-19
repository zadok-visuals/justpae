import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState } from "@/components/ui/Primitives";
import { RateMarkupForm, SettingsForm } from "@/components/admin/RatesForms";
import {
  CnyTierRateForm,
  CnyMarkupForm,
  SupplierRateForm,
} from "@/components/admin/CnyRateForms";
import { listMarkups } from "@/lib/rates/markup";
import { formatNumber } from "@/lib/currencies";
import type { CnyMarkupRate, CnyTierRate, SupplierRate } from "@/lib/types/database";

export const metadata = { title: "Rates and markups" };
export const dynamic = "force-dynamic";

export default async function AdminRatesPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  // Read with the service role, which is the only role that CAN read them:
  // all three CNY pricing tables have RLS on and no policies (0026).
  const [markups, { data: settings }, { data: tiers }, { data: cnyMarkup }, { data: supplier }] =
    await Promise.all([
      listMarkups(),
      admin.from("app_settings").select("key, value, updated_at"),
      admin.from("cny_tier_rates").select("*").order("tier_min_cny"),
      admin.from("cny_markup_rate").select("*").maybeSingle(),
      admin.from("supplier_rates").select("*").order("effective_from", { ascending: false }).limit(50),
    ]);

  const settingValues = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">Rates and markups</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <RateMarkupForm />
        <SettingsForm values={settingValues} />
        <CnyTierRateForm tiers={(tiers ?? []) as CnyTierRate[]} />
        <CnyMarkupForm markup={(cnyMarkup ?? null) as CnyMarkupRate | null} />
        <SupplierRateForm rates={(supplier ?? []) as SupplierRate[]} />
      </div>

      {/* GROUP 6b. The sidebar's "Margin" entry deep-links here —
          /admin/rates#markups — because the spread we charge is configured on
          this page and nowhere else, and giving it its own route would mean
          two editors for one setting. `scroll-mt` clears the sticky mobile
          top bar so the heading does not land underneath it. */}
      <div id="markups" className="scroll-mt-20" />
      <Card>
        <h2 className="mb-3 text-base font-semibold text-foreground">Current markups</h2>
        {markups.length === 0 ? (
          // Headings over an empty tbody read as a broken table. The migrations
          // seed a markup per pair, so an empty list means something went wrong
          // with them — say so rather than showing a blank grid.
          <EmptyState
            title="No markups configured"
            body="The migrations seed one per pair. An empty list means they haven't been applied to this project yet."
            action={{ href: "/admin", label: "Back to admin" }}
          />
        ) : (
        /* The table scrolls inside itself rather than pushing the page
           sideways — there is no viewport where a horizontally scrolling
           document is the right answer. */
        <div className="scroll-x">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="pb-2 font-medium">
                  Pair
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Markup
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {markups.map((markup) => (
                <tr key={markup.id} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium text-foreground">
                    {markup.base_currency} → {markup.quote_currency}
                  </td>
                  <td className="py-2 text-right tabular-nums text-foreground">
                    {formatNumber(Number(markup.markup_rate) * 100, 2)}%
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {new Date(markup.updated_at).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}
