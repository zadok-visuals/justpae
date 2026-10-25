"use client";

import Link from "next/link";
import { maintenanceToastFor } from "@/components/ui/maintenanceToast";
import { TONE_CLASS, type ServiceTone } from "@/lib/home/serviceCatalogue";

/**
 * One round service icon with its label underneath.
 *
 * Every circle in a row is the same size whatever its label does, which is
 * why the circle is fixed at 3rem and the label is clamped to two lines
 * beneath it rather than the whole cell being sized by its content.
 *
 * A service under maintenance stays VISIBLE, carries a "Soon" tag and shows
 * the same toast the nav already uses — the page behind it redirects straight
 * back (proxy.ts), so linking there is a tap that silently bounces.
 */
export function ServiceCircle({
  label,
  href,
  tone,
  live,
  icon,
}: {
  label: string;
  href: string;
  tone: ServiceTone;
  live: boolean;
  icon: React.ReactNode;
}) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className={`relative flex size-12 shrink-0 items-center justify-center rounded-full ${TONE_CLASS[tone]} ${
          live ? "" : "opacity-70"
        }`}
      >
        {icon}
        {!live && (
          <span className="absolute -right-1 -top-1 rounded-full bg-warning px-1 text-[0.5625rem] font-semibold leading-4 text-background">
            Soon
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-center text-[0.6875rem] font-medium leading-tight text-foreground">
        {label}
      </span>
    </>
  );

  const className =
    "flex min-h-[5.25rem] w-full flex-col items-center justify-start gap-1.5 rounded-xl p-1 transition-colors hover:bg-accent active:bg-accent";

  if (!live) {
    return (
      <button type="button" onClick={() => maintenanceToastFor(label)} className={className}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
