/**
 * The time-of-day greeting at the top of Home.
 *
 * A plain function in lib/ rather than a helper inside the header component,
 * because the boundaries are the whole behaviour and they are worth a test:
 * an off-by-one here means somebody is wished good evening at lunchtime.
 */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning,";
  if (hour < 18) return "Good afternoon,";
  return "Good evening,";
}
