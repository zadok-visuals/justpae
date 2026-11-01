import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchFlights, isSerpApiConfigured } from "@/lib/serpapi/flights";
import { FLIGHTS_ENABLED } from "@/lib/flags";

/**
 * GET /api/flights/search
 *
 * Query params mirror SearchFlightsParams:
 *   departure_id, arrival_id, outbound_date, return_date?,
 *   travel_class?, adults?, type?
 *
 * Auth: requires a valid session cookie — this is an authenticated endpoint.
 * Rate-limit: enforced by SerpApi's own quota (250/month free tier).
 */
export async function GET(req: NextRequest) {
  if (!FLIGHTS_ENABLED) {
    return NextResponse.json(
      { error: "Flight search is not available yet." },
      { status: 503 }
    );
  }

  if (!isSerpApiConfigured()) {
    return NextResponse.json(
      { error: "Flight search is not configured. Set SERPAPI_KEY." },
      { status: 503 }
    );
  }

  // Session guard — only authenticated users can burn SerpApi quota.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;

  const departure_id = sp.get("departure_id")?.toUpperCase().trim();
  const arrival_id = sp.get("arrival_id")?.toUpperCase().trim();
  const outbound_date = sp.get("outbound_date")?.trim();
  const return_date = sp.get("return_date")?.trim() || undefined;

  if (!departure_id || !arrival_id || !outbound_date) {
    return NextResponse.json(
      { error: "departure_id, arrival_id and outbound_date are required." },
      { status: 400 }
    );
  }

  // Basic date validation
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(outbound_date) || (return_date && !dateRe.test(return_date))) {
    return NextResponse.json(
      { error: "Dates must be YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const travelClassRaw = parseInt(sp.get("travel_class") ?? "1", 10) as 1 | 2 | 3 | 4;
  const adults = Math.min(Math.max(parseInt(sp.get("adults") ?? "1", 10), 1), 9);
  const tripType = return_date ? 1 : 2;

  try {
    const result = await searchFlights({
      departure_id,
      arrival_id,
      outbound_date,
      return_date,
      travel_class: travelClassRaw,
      adults,
      type: tripType,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/flights/search] error", { message });
    return NextResponse.json(
      { error: "Could not fetch flights. Please try again." },
      { status: 502 }
    );
  }
}
