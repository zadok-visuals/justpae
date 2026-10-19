import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { Banner, Card } from "@/components/ui/Primitives";
import { TextField, SelectField } from "@/components/ui/Field";
import { NotifyMeToggle } from "@/components/flights/NotifyMeToggle";
import { FLIGHTS_ENABLED } from "@/lib/flags";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Flights" };
export const dynamic = "force-dynamic";

/**
 * GROUP 4e — flight booking, visible and under maintenance.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY A DISABLED FORM RATHER THAN A "COMING SOON" CARD
 *
 * A one-line placeholder answers "can I book a flight here" with "no" and
 * stops. The disabled form answers three more questions a user actually has
 * before they decide whether to wait or go elsewhere: what will I be able to
 * search on, is this a real product or a stub, and when.
 *
 * It is disabled at the FIELD level rather than hidden behind an overlay, so
 * every control is in the accessibility tree and announced as unavailable —
 * an overlay would leave a keyboard user tabbing into inputs they cannot
 * use, which is worse than not rendering them.
 *
 * NO PROVIDER CALL HAPPENS ON THIS PAGE, under any condition, while the flag
 * is off. There is no search action to invoke: the form has no `action`, the
 * submit is `disabled`, and nothing here imports a flight provider — because
 * none has been chosen, and inventing an API for an unconfirmed provider is
 * the thing this codebase refuses to do.
 *
 * The only write on the page is the Notify me toggle, which touches
 * `feature_interest` (migration 0031) and nothing else.
 */
export default async function FlightsPage() {
  const supabase = await createClient();
  const user = await requireSessionUser();

  const { data: interest } = await supabase
    .from("feature_interest")
    .select("feature")
    .eq("user_id", user.id)
    .eq("feature", "flights")
    .maybeSingle();

  return (
    <PageShell
      title="Flights"
      subtitle="Search and book flights, paid from your justpae wallets."
    >
      <div className="space-y-5">
        {!FLIGHTS_ENABLED && (
          <Banner tone="info" title="Flight booking is under maintenance">
            We&apos;ll notify you when it opens.
          </Banner>
        )}

        <Card className="space-y-3">
          {/* A real fieldset, so `disabled` propagates to every control
              inside it and assistive technology is told once that the whole
              group is unavailable, rather than per field. */}
          <fieldset disabled={!FLIGHTS_ENABLED} className="space-y-3">
            <legend className="sr-only">Search flights</legend>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="From"
                name="from"
                placeholder="Lagos (LOS)"
                autoComplete="off"
              />
              <TextField label="To" name="to" placeholder="Nairobi (NBO)" autoComplete="off" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Departing" name="departing" type="date" />
              <TextField label="Returning" name="returning" type="date" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Passengers" name="passengers" defaultValue="1">
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? "passenger" : "passengers"}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Cabin" name="cabin" defaultValue="economy">
                <option value="economy">Economy</option>
                <option value="premium_economy">Premium economy</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </SelectField>
            </div>

            <button
              type="button"
              disabled
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Search flights
            </button>
          </fieldset>
        </Card>

        {!FLIGHTS_ENABLED && (
          <NotifyMeToggle
            feature="flights"
            initialInterested={interest != null}
            label="Notify me when flights open"
          />
        )}
      </div>
    </PageShell>
  );
}
