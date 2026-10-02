import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Primitives";
import { RateMarkupForm, SettingsForm } from "@/components/admin/RatesForms";
import { listMarkups } from "@/lib/rates/markup";
import { formatNumber } from "@/lib/currencies";

export const metadata = { title: "Rates and markups" };
export const dynamic = "force-dynamic";

export default async function AdminRatesPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  const [markups, { data: settings }] = await Promise.all([
    listMarkups(),
    admin.from("app_settings").select("key, value, updated_at"),
  ]);

  const settingValues = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">Rates and markups</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <RateMarkupForm />
        <SettingsForm values={settingValues} />
      </div>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-foreground">Current markups</h2>
        {/* The table scrolls inside itself rather than pushing the page
            sideways — there is no viewport where a horizontally scrolling
            document is the right answer. */}
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
      </Card>
    </div>
  );
}
