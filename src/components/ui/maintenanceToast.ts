"use client";

import { toast } from "sonner";

/**
 * GROUP 2c/3. The one sentence every locked nav entry shows on tap, instead
 * of navigating to a page that would just redirect it straight back.
 */
export function maintenanceToastFor(label: string): void {
  toast(`${label} is under maintenance. We'll let you know when it's back.`);
}
