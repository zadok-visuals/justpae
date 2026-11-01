import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { Banner, Card } from "@/components/ui/Primitives";
import { NotifyMeToggle } from "@/components/flights/NotifyMeToggle";
import { FlightsSearchAndBook } from "@/components/flights/FlightsSearchAndBook";
import { FLIGHTS_ENABLED } from "@/lib/flags";
import { isSerpApiConfigured } from "@/lib/serpapi/flights";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Flights" };
export const dynamic = "force-dynamic";

/**
 * Flights page — now with live search via SerpApi + Google Flights data.
 *
 * ── STATES ──────────────────────────────────────────────────────────────────
 *
 * 1. FLIGHTS_ENABLED=false → redirect to /home (proxy handles this too).
 *
 * 2. FLIGHTS_ENABLED=true, SERPAPI_KEY unset → show the coming-soon shell
 *    with the notify toggle. No fake search, no invented provider call.
 *
 * 3. FLIGHTS_ENABLED=true, SERPAPI_KEY set → live search, live results,
 *    booking confirmation flow, booking slip, confirmation email.
 *
 * ── BOOKING MODEL ───────────────────────────────────────────────────────────
 *
 * SerpApi gives us Google Flights data (prices, schedules, logos). The booking
 * itself uses a manual-confirmation model: the user selects a flight, we
 * generate a reference and email a booking slip, and the ops team (or a later
 * automated NDC rail like Duffel) processes the actual ticket. This is exactly
 * the Pay to China pattern and gets the feature live immediately without IATA
 * accreditation.
 */
export default async function FlightsPage() {
  if (!FLIGHTS_ENABLED) redirect("/home");

  const supabase = await createClient();
  const user = await requireSessionUser();

  const { data: interest } = await supabase
    .from("feature_interest")
    .select("feature")
    .eq("user_id", user.id)
    .eq("feature", "flights")
    .maybeSingle();

  const liveSearch = isSerpApiConfigured();

  return (
    <PageShell
      title="Flights"
      subtitle={
        liveSearch
          ? "Search and book flights, paid from your JustPae wallets."
          : "Search and book flights, paid from your JustPae wallets."
      }
    >
      <div className="space-y-5">
        {!liveSearch && (
          <Banner tone="info" title="Flight search is being set up">
            Live flight search is coming shortly. Fill in your details below to search, or turn on
            notifications to hear when it opens.
          </Banner>
        )}

        {liveSearch ? (
          <FlightsSearchAndBook />
        ) : (
          <>
            {/* Disabled preview form — shown when SerpApi isn't configured yet */}
            <Card className="space-y-3">
              <fieldset disabled className="space-y-3">
                <legend className="sr-only">Search flights (coming soon)</legend>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">From</label>
                    <input
                      disabled
                      placeholder="Lagos (LOS)"
                      className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground opacity-50 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">To</label>
                    <input
                      disabled
                      placeholder="Nairobi (NBO)"
                      className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground opacity-50 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Departing
                    </label>
                    <input
                      disabled
                      type="date"
                      className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm opacity-50 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Returning
                    </label>
                    <input
                      disabled
                      type="date"
                      className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm opacity-50 cursor-not-allowed"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Search flights
                </button>
              </fieldset>
            </Card>

            <NotifyMeToggle
              feature="flights"
              initialInterested={interest != null}
              label="Notify me when flights open"
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
