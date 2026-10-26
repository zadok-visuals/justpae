import { Pill } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  MAINTENANCE_LABEL,
  UNAVAILABLE_LABEL,
  type UnavailableKind,
} from "@/lib/ui/unavailability";

/**
 * GROUP 4e/4f, then the "one Soon state" rewrite — the badge for a feature
 * that is not open yet, whether it is down-and-coming-back (`maintenance`)
 * or never opened (`soon`). Both render the same orange StatusBadge now: the
 * `kind` stays distinct internally (the reason sentence next to the badge
 * still says which one it is), but the one word on the badge no longer
 * tries to carry that distinction too.
 */
export function MaintenanceBadge({ className = "" }: { className?: string }) {
  return <StatusBadge className={className} />;
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
 * The same badge for the OTHER closed states, each still routed through
 * UNAVAILABLE_LABEL so the enum stays the one source of truth for the word.
 * `maintenance` and `soon` both land on StatusBadge; every other kind keeps
 * the neutral grey Pill, because those are standing facts about an account
 * rather than a "not yet" — see the enum's own file for why each is a
 * separate word.
 */
export function UnavailableBadge({
  kind,
  className = "",
}: {
  kind: UnavailableKind;
  className?: string;
}) {
  if (kind === "maintenance" || kind === "soon") {
    return <StatusBadge className={className} />;
  }
  return (
    <Pill tone="neutral" className={className}>
      {UNAVAILABLE_LABEL[kind]}
    </Pill>
  );
}
