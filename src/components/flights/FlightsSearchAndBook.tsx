"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { FlightOption, SerpApiFlightsResult } from "@/lib/serpapi/flights";
import { bookFlight } from "@/lib/actions/flights";
import type { BookFlightState } from "@/lib/actions/flights";
import { formatDuration } from "@/lib/serpapi/flights";

// ── Cabin labels ─────────────────────────────────────────────────────────────
const CABIN_OPTIONS = [
  { value: "1", label: "Economy" },
  { value: "2", label: "Premium Economy" },
  { value: "3", label: "Business" },
  { value: "4", label: "First Class" },
];

// ── Utility ──────────────────────────────────────────────────────────────────
function formatPrice(usd: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usd);
}

function formatDateReadable(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

// ── Search form ───────────────────────────────────────────────────────────────
interface SearchParams {
  departure_id: string;
  arrival_id: string;
  outbound_date: string;
  return_date: string;
  travel_class: string;
  adults: string;
}

function SearchForm({
  onResults,
  onLoading,
}: {
  onResults: (results: SerpApiFlightsResult, params: SearchParams) => void;
  onLoading: (v: boolean) => void;
}) {
  const [form, setForm] = useState<SearchParams>({
    departure_id: "",
    arrival_id: "",
    outbound_date: "",
    return_date: "",
    travel_class: "1",
    adults: "1",
  });
  const [isOneWay, setIsOneWay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.departure_id.trim() || !form.arrival_id.trim() || !form.outbound_date) {
      setError("Please fill in all required fields.");
      return;
    }

    onLoading(true);
    try {
      const params = new URLSearchParams({
        departure_id: form.departure_id.toUpperCase().trim(),
        arrival_id: form.arrival_id.toUpperCase().trim(),
        outbound_date: form.outbound_date,
        travel_class: form.travel_class,
        adults: form.adults,
      });
      if (!isOneWay && form.return_date) params.set("return_date", form.return_date);

      const res = await fetch(`/api/flights/search?${params.toString()}`);
      const data = (await res.json()) as SerpApiFlightsResult;

      if (!res.ok || data.error) {
        setError(data.error ?? "Couldn't fetch flights. Please try again.");
        return;
      }
      onResults(data, {
        ...form,
        return_date: isOneWay ? "" : form.return_date,
      });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      onLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Trip type toggle */}
      <div className="flex gap-2 text-sm">
        {["Round trip", "One way"].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setIsOneWay(i === 1)}
            className={`min-h-9 rounded-full px-4 font-medium transition-colors ${
              isOneWay === (i === 1)
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-secondary text-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1" htmlFor="from-field">
            From
          </label>
          <input
            id="from-field"
            type="text"
            placeholder="LOS — Lagos"
            value={form.departure_id}
            onChange={(e) => setForm((f) => ({ ...f, departure_id: e.target.value }))}
            className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1" htmlFor="to-field">
            To
          </label>
          <input
            id="to-field"
            type="text"
            placeholder="LHR — London"
            value={form.arrival_id}
            onChange={(e) => setForm((f) => ({ ...f, arrival_id: e.target.value }))}
            className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1" htmlFor="depart-date">
            Departing
          </label>
          <input
            id="depart-date"
            type="date"
            min={today}
            value={form.outbound_date}
            onChange={(e) => setForm((f) => ({ ...f, outbound_date: e.target.value }))}
            className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>
        {!isOneWay && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="return-date">
              Returning
            </label>
            <input
              id="return-date"
              type="date"
              min={form.outbound_date || today}
              value={form.return_date}
              onChange={(e) => setForm((f) => ({ ...f, return_date: e.target.value }))}
              className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1" htmlFor="passengers">
            Passengers
          </label>
          <select
            id="passengers"
            value={form.adults}
            onChange={(e) => setForm((f) => ({ ...f, adults: e.target.value }))}
            className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "passenger" : "passengers"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1" htmlFor="cabin-class">
            Cabin class
          </label>
          <select
            id="cabin-class"
            value={form.travel_class}
            onChange={(e) => setForm((f) => ({ ...f, travel_class: e.target.value }))}
            className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {CABIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed"
      >
        Search flights
      </button>
    </form>
  );
}

// ── Flight result card ────────────────────────────────────────────────────────
function FlightCard({
  flight,
  searchParams,
  onBook,
}: {
  flight: FlightOption;
  searchParams: SearchParams;
  onBook: (flight: FlightOption) => void;
}) {
  const firstLeg = flight.flights[0];
  const lastLeg = flight.flights[flight.flights.length - 1];
  const stops = flight.flights.length - 1;

  const airline = firstLeg?.airline ?? "Unknown airline";
  const airlineLogo = firstLeg?.airline_logo ?? flight.airline_logo;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {airlineLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={airlineLogo}
              alt={airline}
              className="h-8 w-8 shrink-0 rounded object-contain"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{airline}</p>
            <p className="text-xs text-muted-foreground">
              {flight.flights.map((f) => f.flight_number).join(", ")}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-lg font-bold text-primary">{formatPrice(flight.price)}</p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <div className="text-center">
          <p className="font-mono font-semibold text-foreground">
            {firstLeg?.departure_airport.id}
          </p>
          <p className="text-xs text-muted-foreground">
            {firstLeg?.departure_airport.time?.slice(11, 16)}
          </p>
        </div>

        <div className="flex flex-1 flex-col items-center gap-0.5">
          <p className="text-xs text-muted-foreground">{formatDuration(flight.total_duration)}</p>
          <div className="flex w-full items-center gap-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] text-muted-foreground">
              {stops === 0 ? "Direct" : `${stops} stop${stops > 1 ? "s" : ""}`}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {flight.layovers && flight.layovers.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              via {flight.layovers.map((l) => l.id).join(", ")}
            </p>
          )}
        </div>

        <div className="text-center">
          <p className="font-mono font-semibold text-foreground">
            {lastLeg?.arrival_airport.id}
          </p>
          <p className="text-xs text-muted-foreground">
            {lastLeg?.arrival_airport.time?.slice(11, 16)}
          </p>
        </div>
      </div>

      {firstLeg?.legroom && (
        <p className="text-xs text-muted-foreground">
          {firstLeg.travel_class} · {firstLeg.legroom} legroom
        </p>
      )}

      <button
        type="button"
        onClick={() => onBook(flight)}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-primary bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
      >
        Book this flight
      </button>
    </div>
  );
}

// ── Booking confirmation slip ─────────────────────────────────────────────────
function BookingSlip({
  booking,
  onDone,
}: {
  booking: NonNullable<BookFlightState["booking"]>;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
        <p className="text-sm font-semibold text-green-800 dark:text-green-200">
          ✓ Booking request received
        </p>
        <p className="mt-1 text-xs text-green-700 dark:text-green-300">
          A confirmation has been sent to your email. Our team will process your booking and
          send the e-ticket within 2 hours.
        </p>
      </div>

      {/* The slip itself */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        <div className="bg-primary/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            JustPae Flight Booking
          </p>
          <p className="mt-0.5 font-mono text-2xl font-bold tracking-wider text-primary">
            {booking.reference}
          </p>
          <p className="text-xs text-muted-foreground">Booking reference</p>
        </div>

        <div className="px-4 py-3 space-y-2.5">
          <Row label="Passenger" value={booking.passengerName} />
          <Row
            label="Route"
            value={`${booking.departure} → ${booking.arrival}${booking.returnDate ? ` → ${booking.departure}` : ""}`}
          />
          <Row label="Departing" value={formatDateReadable(booking.outboundDate)} />
          {booking.returnDate && (
            <Row label="Returning" value={formatDateReadable(booking.returnDate)} />
          )}
          <Row label="Airline" value={booking.airline} />
          <Row label="Flight(s)" value={booking.flightNumbers} mono />
          <Row label="Cabin" value={booking.cabinClass} />
          <Row label="Duration" value={formatDuration(booking.durationMinutes)} />
        </div>

        <div className="bg-muted/60 px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Total</p>
          <p className="font-semibold text-foreground">{booking.totalAmount}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Screenshot this page or check your email — your reference is{" "}
        <strong className="font-mono">{booking.reference}</strong>. You'll need it for check-in.
      </p>

      <button
        type="button"
        onClick={onDone}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        Done
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="shrink-0 text-sm text-muted-foreground">{label}</p>
      <p className={`text-right text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

// ── Booking confirmation dialog ───────────────────────────────────────────────
function BookingDialog({
  flight,
  searchParams,
  onClose,
  onConfirmed,
}: {
  flight: FlightOption;
  searchParams: SearchParams;
  onClose: () => void;
  onConfirmed: (booking: NonNullable<BookFlightState["booking"]>) => void;
}) {
  const [state, formAction] = useActionState<BookFlightState, FormData>(bookFlight, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.booking) {
      toast.success("Booking confirmed!");
      onConfirmed(state.booking);
    }
  }, [state.booking, onConfirmed]);

  const firstLeg = flight.flights[0];
  const lastLeg = flight.flights[flight.flights.length - 1];
  const airline = firstLeg?.airline ?? "Unknown";
  const flightNumbers = flight.flights.map((f) => f.flight_number).join(", ");
  const cabinLabel =
    CABIN_OPTIONS.find((o) => o.value === searchParams.travel_class)?.label ?? "Economy";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-background p-5 shadow-xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Confirm booking</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-2 mb-4 text-sm">
          <Row label="Route" value={`${searchParams.departure_id} → ${searchParams.arrival_id}`} />
          <Row label="Airline" value={airline} />
          <Row label="Flight(s)" value={flightNumbers} mono />
          <Row
            label="Departing"
            value={`${firstLeg?.departure_airport.time?.slice(0, 16) ?? searchParams.outbound_date}`}
          />
          <Row
            label="Arriving"
            value={`${lastLeg?.arrival_airport.time?.slice(0, 16) ?? ""}`}
          />
          <Row label="Duration" value={formatDuration(flight.total_duration)} />
          <Row label="Cabin" value={cabinLabel} />
          <Row label="Passengers" value={`${searchParams.adults}`} />
          <div className="flex items-center justify-between border-t border-border pt-2">
            <p className="font-semibold text-foreground">Total</p>
            <p className="text-lg font-bold text-primary">{formatPrice(flight.price)}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          By confirming, you agree to our booking terms. Our team will process this booking and
          send your e-ticket by email within 2 hours.
        </p>

        {state.error && (
          <p role="alert" className="text-sm text-destructive mb-3">
            {state.error}
          </p>
        )}

        <form ref={formRef} action={formAction}>
          {/* Hidden fields carry all booking data */}
          <input type="hidden" name="departure" value={searchParams.departure_id} />
          <input type="hidden" name="arrival" value={searchParams.arrival_id} />
          <input type="hidden" name="outbound_date" value={searchParams.outbound_date} />
          <input type="hidden" name="return_date" value={searchParams.return_date} />
          <input type="hidden" name="airline" value={airline} />
          <input type="hidden" name="flight_numbers" value={flightNumbers} />
          <input type="hidden" name="travel_class" value={searchParams.travel_class} />
          <input type="hidden" name="price_usd" value={flight.price} />
          <input type="hidden" name="duration_minutes" value={flight.total_duration} />
          <input type="hidden" name="passengers" value={searchParams.adults} />

          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Confirm booking — {formatPrice(flight.price)}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main flights search & book component ──────────────────────────────────────
export function FlightsSearchAndBook() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SerpApiFlightsResult | null>(null);
  const [searchParams, setSearchParams] = useState<SearchParams | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<FlightOption | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<NonNullable<BookFlightState["booking"]> | null>(null);

  function handleResults(r: SerpApiFlightsResult, p: SearchParams) {
    setResults(r);
    setSearchParams(p);
    setSelectedFlight(null);
    setConfirmedBooking(null);
  }

  if (confirmedBooking) {
    return (
      <BookingSlip
        booking={confirmedBooking}
        onDone={() => {
          setConfirmedBooking(null);
          setResults(null);
          router.refresh();
        }}
      />
    );
  }

  const allFlights = [
    ...(results?.best_flights ?? []),
    ...(results?.other_flights ?? []),
  ];

  return (
    <div className="space-y-5">
      {/* Search form */}
      <div className="rounded-xl border border-border bg-card p-4">
        <SearchForm onResults={handleResults} onLoading={setLoading} />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Searching live flights…</p>
          </div>
        </div>
      )}

      {/* Price insights */}
      {results?.price_insights && !loading && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Price level</span>
          <span
            className={`font-medium capitalize ${
              results.price_insights.price_level === "low"
                ? "text-green-600"
                : results.price_insights.price_level === "high"
                  ? "text-red-500"
                  : "text-foreground"
            }`}
          >
            {results.price_insights.price_level ?? "typical"}
            {results.price_insights.lowest_price
              ? ` · from ${formatPrice(results.price_insights.lowest_price)}`
              : ""}
          </span>
        </div>
      )}

      {/* Results */}
      {!loading && results && allFlights.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No flights found for that route and date. Try different dates or airports.
          </p>
        </div>
      )}

      {!loading && allFlights.length > 0 && (
        <div className="space-y-3">
          {results?.best_flights && results.best_flights.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Best options
            </p>
          )}
          {(results?.best_flights ?? []).map((flight, i) => (
            <FlightCard
              key={`best-${i}`}
              flight={flight}
              searchParams={searchParams!}
              onBook={setSelectedFlight}
            />
          ))}

          {results?.other_flights && results.other_flights.length > 0 && (
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Other flights
            </p>
          )}
          {(results?.other_flights ?? []).map((flight, i) => (
            <FlightCard
              key={`other-${i}`}
              flight={flight}
              searchParams={searchParams!}
              onBook={setSelectedFlight}
            />
          ))}
        </div>
      )}

      {/* Booking confirmation dialog */}
      {selectedFlight && searchParams && (
        <BookingDialog
          flight={selectedFlight}
          searchParams={searchParams}
          onClose={() => setSelectedFlight(null)}
          onConfirmed={(b) => {
            setSelectedFlight(null);
            setConfirmedBooking(b);
          }}
        />
      )}
    </div>
  );
}
