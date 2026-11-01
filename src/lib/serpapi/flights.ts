/**
 * SerpApi Google Flights client — src/lib/serpapi/flights.ts
 *
 * Uses SerpApi's Google Flights engine to search real flight data.
 * SerpApi wraps Google Flights and returns structured JSON — there is no
 * official public Google Flights API, so this is the recommended approach.
 *
 * Free tier: 250 searches/month.
 * Paid: starts at $25/month for 1,000 searches.
 * Docs: https://serpapi.com/google-flights-api
 *
 * NEVER expose SERPAPI_KEY to the browser — all calls here are server-only.
 */

export interface FlightLeg {
  airline: string;
  airline_logo: string;
  flight_number: string;
  departure_airport: { name: string; id: string; time: string };
  arrival_airport: { name: string; id: string; time: string };
  duration: number; // minutes
  airplane: string;
  travel_class: string;
  legroom: string;
  overnight: boolean;
  often_delayed_by_over_30_min?: boolean;
}

export interface FlightOption {
  /** Combined array of legs (outbound + return for round trip). */
  flights: FlightLeg[];
  total_duration: number; // minutes
  price: number; // USD
  currency?: string;
  /** Booking token returned by Google — links to the airline/OTA booking page. */
  booking_token?: string;
  /** Deprecated by SerpApi in newer responses; prefer booking_token. */
  departure_token?: string;
  layovers?: Array<{
    duration: number;
    name: string;
    id: string;
    overnight?: boolean;
  }>;
  type?: string; // "Round trip" | "One way"
  airline_logo?: string;
  carbon_emissions?: {
    this_flight: number;
    typical_for_this_route: number;
    difference_percent: number;
  };
}

export interface SerpApiFlightsResult {
  /** Lower-priced options with one or more stops. */
  other_flights?: FlightOption[];
  /** Best (often direct/fastest/cheapest) options. */
  best_flights?: FlightOption[];
  price_insights?: {
    lowest_price?: number;
    price_level?: string; // "low" | "typical" | "high"
  };
  airports?: Array<{
    departure: Array<{ airport: { name: string; id: string }; city: string; country: string }>;
    arrival: Array<{ airport: { name: string; id: string }; city: string; country: string }>;
  }>;
  error?: string;
}

export interface SearchFlightsParams {
  /** IATA airport code, e.g. "LOS", "NBO", "LHR" */
  departure_id: string;
  arrival_id: string;
  outbound_date: string; // YYYY-MM-DD
  return_date?: string;  // YYYY-MM-DD — omit for one-way
  /** 1 = Economy (default), 2 = Premium, 3 = Business, 4 = First */
  travel_class?: 1 | 2 | 3 | 4;
  adults?: number;
  /** 1 = Round trip, 2 = One way */
  type?: 1 | 2;
  currency?: string;
  hl?: string;
}

export function isSerpApiConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

export async function searchFlights(
  params: SearchFlightsParams
): Promise<SerpApiFlightsResult> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("[serpapi] SERPAPI_KEY is not set");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_flights");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("departure_id", params.departure_id.toUpperCase());
  url.searchParams.set("arrival_id", params.arrival_id.toUpperCase());
  url.searchParams.set("outbound_date", params.outbound_date);
  if (params.return_date) url.searchParams.set("return_date", params.return_date);
  url.searchParams.set("travel_class", String(params.travel_class ?? 1));
  url.searchParams.set("adults", String(params.adults ?? 1));
  url.searchParams.set("type", String(params.type ?? (params.return_date ? 1 : 2)));
  url.searchParams.set("currency", params.currency ?? "USD");
  url.searchParams.set("hl", params.hl ?? "en");
  // deep_search gives more precise results at the cost of ~2× response time.
  url.searchParams.set("deep_search", "true");

  const res = await fetch(url.toString(), {
    method: "GET",
    next: { revalidate: 300 }, // Cache for 5 minutes — prices don't change second-by-second
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[serpapi] GET /search.json → ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json() as SerpApiFlightsResult;

  if (data.error) {
    throw new Error(`[serpapi] API error: ${data.error}`);
  }

  return data;
}

/** Format flight duration from minutes to "Xh Ym" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
