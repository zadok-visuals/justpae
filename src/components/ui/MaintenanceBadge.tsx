import { Pill } from "@/components/ui/Primitives";

/**
 * GROUP 4e / 4f — the one word this product uses for a feature that is
 * temporarily down.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY ONE COMPONENT AND NOT A STRING IN EACH PLACE
 *
 * The state was being described three different ways depending on which
 * screen you were on: "coming soon" on /bills and the USD account page,
 * "· unavailable" in the deposit and convert pickers, and "under
 * maintenance" in the GHS deposit reason. Those are three different
 * promises:
 *
 *   "coming soon"   — a feature that was never offered and might arrive.
 *   "unavailable"   — no information at all. Broken? Not for me? Never?
 *   "maintenance"   — a thing this product does, which is down, and will be
 *                     back.
 *
 * For somebody holding cedis right now, only the third is true, and it is
 * the only one of the three that does not cost their trust. Centralising it
 * is what stops the next copy edit reintroducing one of the other two.
 *
 * The badge carries no tone of alarm — `neutral`, not `failed`. A feature
 * under maintenance is not an error the user caused or needs to act on.
 */
export function MaintenanceBadge({ className = "" }: { className?: string }) {
  return (
    <Pill tone="neutral" className={className}>
      Maintenance
    </Pill>
  );
}

/** The word itself, for the places that need a string rather than a node. */
export const MAINTENANCE_LABEL = "Maintenance";
