"use client";

import type { ReactElement } from "react";
import { QuickActionButton } from "@/components/home/QuickActionTile";
import { maintenanceToastFor } from "@/components/ui/maintenanceToast";

/**
 * GROUP 2c/3a. A locked quick action: visible, badged, and a toast instead
 * of a navigation — the page it would have opened redirects straight back
 * now (src/proxy.ts's maintenanceRedirect), so linking there is a tap that
 * silently bounces.
 */
export function MaintenanceQuickAction({
  label,
  icon,
}: {
  label: string;
  /** Already rendered — see QuickActionTile.tsx's QuickActionTileProps. */
  icon: ReactElement;
}) {
  return (
    <QuickActionButton
      label={label}
      icon={icon}
      maintenance
      onClick={() => maintenanceToastFor(label)}
    />
  );
}
