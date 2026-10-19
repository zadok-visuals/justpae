import { Pill } from "@/components/ui/Primitives";
import {
  MAINTENANCE_LABEL,
  UNAVAILABLE_LABEL,
  type UnavailableKind,
} from "@/lib/ui/unavailability";

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

/**
 * The word itself, for the places that need a string rather than a node.
 *
 * Re-exported from src/lib/ui/unavailability.ts rather than declared here, so
 * a server module (deposit availability, route resolution, the rate board)
 * can reach the vocabulary without importing a component — and so the badge
 * and the picker suffixes cannot drift to two different words.
 */
export { MAINTENANCE_LABEL };

/**
 * GROUP 4f — the same badge for the OTHER closed states.
 *
 * Maintenance is not the only reason a thing is shut, and a badge that says
 * "Maintenance" over a currency that is simply not supported is the generic
 * "unavailable" problem again with a friendlier face. See the enum's own file
 * for why each of these is a separate word.
 *
 * `maintenance` routes through MaintenanceBadge so there is exactly one
 * definition of how that state looks.
 */
export function UnavailableBadge({
  kind,
  className = "",
}: {
  kind: UnavailableKind;
  className?: string;
}) {
  if (kind === "maintenance") return <MaintenanceBadge className={className} />;
  return (
    <Pill tone="neutral" className={className}>
      {UNAVAILABLE_LABEL[kind]}
    </Pill>
  );
}
