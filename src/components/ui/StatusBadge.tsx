import { SOON_LABEL } from "@/lib/ui/unavailability";

/**
 * THE "Soon" pill. One component, so every surface that tells a customer a
 * currency, a rail or a feature is not open yet draws the identical badge —
 * GHS and USD's wallet lock, the deposit/withdraw/convert pickers, the Bills
 * and Flights tiles, the sidebar, Home's wallet rail and Quick services.
 *
 * Orange and soft, never neutral grey: "Soon" is a state worth noticing, not
 * an error, which is why it is a step lighter than --color-warning rather
 * than borrowing it outright.
 */
export function StatusBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-soon-bg px-2 py-0.5 text-xs font-medium text-soon-text ${className}`}
    >
      {SOON_LABEL}
    </span>
  );
}
