"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * An illustration from public/, with a fallback that keeps the
 * layout intact when the file is not there.
 *
 * WHICH ONE TO DRAW IS DECIDED ON THE SERVER — see illustrationExists() in
 * src/lib/home/illustrations.ts for why `onError` alone cannot do it. The
 * caller passes `exists`, and an absent file never reaches the browser as an
 * <img> at all.
 *
 * `onError` is still wired up, as the safety net for the narrower case the
 * server check cannot see: the file is on disk but the optimizer refuses it
 * (a corrupt PNG, an unsupported colour profile). That error arrives after
 * hydration, so the handler is there to catch it.
 */
export function TileArt({
  src,
  alt,
  size,
  exists,
  eager = false,
  fallback,
  fallbackClassName,
  fallbackSize = 48,
  className = "",
}: {
  /** File name only — resolved under /illustrations. */
  src: string;
  alt: string;
  /** Rendered height in px; the width is free, with object-contain. */
  size: number;
  /** From illustrationExists(), on the server. */
  exists: boolean;
  eager?: boolean;
  fallback: React.ReactNode;
  /** The fallback circle's tint, e.g. "bg-icon-green-soft text-icon-green". */
  fallbackClassName: string;
  fallbackSize?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!exists || failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-full ${fallbackClassName} ${className}`}
        style={{ width: fallbackSize, height: fallbackSize }}
      >
        {fallback}
      </span>
    );
  }

  return (
    <Image
      src={`/${src}`}
      alt={alt}
      width={size}
      height={size}
      // The height is what the layout is built around; the width follows the
      // artwork's own aspect ratio rather than being squared off.
      style={{ height: size, width: "auto" }}
      priority={eager}
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
    />
  );
}
