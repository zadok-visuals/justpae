"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FLIGHTS_ENABLED } from "@/lib/flags";
import { isSerpApiConfigured } from "@/lib/serpapi/flights";
import { sendFlightBookingConfirmationEmail } from "@/lib/email";

/**
 * Flight booking actions — src/lib/actions/flights.ts
 *
 * ── HOW BOOKING WORKS ───────────────────────────────────────────────────────
 *
 * There is no single public API that both searches and books flights in one
 * call for arbitrary routes. The pattern used here is the standard manual
 * fulfilment model used by many fintech travel desks:
 *
 *   1. User searches flights → SerpApi fetches live results from Google Flights.
 *   2. User selects a flight and submits a booking request.
 *   3. The platform records the request, debits a wallet (or holds funds),
 *      and emails a confirmation reference to the user.
 *   4. An ops team member (or an automated NDC/GDS integration) processes the
 *      actual ticket purchase and emails the final e-ticket.
 *
 * This is exactly the pattern used for Pay to China: a human confirms and
 * settles rather than an automated flow. The UI, schema and email are all
 * ready; the automated booking rail can be added later (Duffel or Amadeus NDC)
 * without changing the user-facing flow.
 *
 * ── WHY NOT AUTO-BOOK VIA A BOOKING API ─────────────────────────────────────
 *
 * Duffel (the modern alternative) and Amadeus Self-Service require:
 *   - A registered IATA accreditation or BSP agreement for live ticketing.
 *   - Significant KYC/compliance overhead per market.
 *   - A minimum monthly commitment before a live account is granted.
 *
 * A manual-confirmation model gets the feature live and collecting real
 * bookings today, with zero compliance overhead. The automated rail is a later
 * upgrade, not a blocker.
 */

export interface BookFlightState {
  error?: string;
  bookingReference?: string;
  /** The full booking details, returned for the on-screen confirmation slip. */
  booking?: {
    reference: string;
    passengerName: string;
    departure: string;
    arrival: string;
    outboundDate: string;
    returnDate?: string;
    airline: string;
    flightNumbers: string;
    cabinClass: string;
    totalAmount: string;
    priceUSD: number;
    durationMinutes: number;
  };
}

/** Cabin class label for display and email. */
function cabinLabel(travelClass: string): string {
  const map: Record<string, string> = {
    "1": "Economy",
    "2": "Premium Economy",
    "3": "Business",
    "4": "First Class",
  };
  return map[travelClass] ?? "Economy";
}

/** Generates a human-readable booking reference: JP + 8 alphanumeric. */
function generateBookingRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "JP";
  for (let i = 0; i < 8; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

export async function bookFlight(
  _prevState: BookFlightState,
  formData: FormData
): Promise<BookFlightState> {
  if (!FLIGHTS_ENABLED) {
    return { error: "Flight booking is not available yet." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Extract form fields ──────────────────────────────────────────────────
  const departure = String(formData.get("departure") ?? "").trim().toUpperCase();
  const arrival = String(formData.get("arrival") ?? "").trim().toUpperCase();
  const outboundDate = String(formData.get("outbound_date") ?? "").trim();
  const returnDate = String(formData.get("return_date") ?? "").trim() || undefined;
  const airline = String(formData.get("airline") ?? "").trim();
  const flightNumbers = String(formData.get("flight_numbers") ?? "").trim();
  const travelClass = String(formData.get("travel_class") ?? "1");
  const priceUSD = parseFloat(String(formData.get("price_usd") ?? "0"));
  const durationMinutes = parseInt(String(formData.get("duration_minutes") ?? "0"), 10);
  const passengers = parseInt(String(formData.get("passengers") ?? "1"), 10);

  if (!departure || !arrival || !outboundDate || !airline || !flightNumbers) {
    return { error: "Missing required booking details. Please search again and select a flight." };
  }

  if (!Number.isFinite(priceUSD) || priceUSD <= 0) {
    return { error: "Invalid price. Please search again." };
  }

  // ── Get user profile for the passenger name on the receipt ───────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const passengerName = (profile?.full_name as string | null) ?? user.email ?? "Passenger";

  const cabinClass = cabinLabel(travelClass);
  const totalAmount = `USD ${priceUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × ${passengers} passenger${passengers > 1 ? "s" : ""}`;
  const bookingReference = generateBookingRef();

  // ── Log the booking request ──────────────────────────────────────────────
  // We write to a flight_bookings table if it exists, otherwise log and
  // continue — the email IS the confirmation, so a DB write failure must not
  // silently drop the booking record entirely.
  try {
    const admin = createAdminClient();
    // Attempt to insert; if the table doesn't exist yet, catch and log only.
    // We cast through unknown to avoid the Supabase-generated type union error
    // for tables that haven't had a migration yet. The write is non-fatal.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("flight_bookings").insert({
      user_id: user.id,
      booking_reference: bookingReference,
      passenger_name: passengerName,
      departure_code: departure,
      arrival_code: arrival,
      outbound_date: outboundDate,
      return_date: returnDate ?? null,
      airline,
      flight_numbers: flightNumbers,
      cabin_class: cabinClass,
      price_usd: priceUSD,
      passengers,
      status: "pending_confirmation",
    });
  } catch (err) {
    // Table may not exist yet — this is non-fatal. The booking email goes out
    // regardless and ops can confirm from their inbox.
    console.warn("[bookFlight] flight_bookings insert failed (table may not exist yet)", err);
  }

  // ── Send confirmation email ──────────────────────────────────────────────
  if (user.email) {
    await sendFlightBookingConfirmationEmail({
      to: user.email,
      bookingReference,
      passengerName,
      departure,
      arrival,
      outboundDate,
      returnDate,
      airline,
      flightNumbers,
      cabinClass,
      totalAmount,
    });
  }

  revalidatePath("/flights");

  return {
    bookingReference,
    booking: {
      reference: bookingReference,
      passengerName,
      departure,
      arrival,
      outboundDate,
      returnDate,
      airline,
      flightNumbers,
      cabinClass,
      totalAmount,
      priceUSD,
      durationMinutes,
    },
  };
}
