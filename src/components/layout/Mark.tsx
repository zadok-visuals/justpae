import Image from "next/image";

/**
 * The justpae mark-only icon (used in small contexts like the legal page header).
 * Still uses the inline SVG since it's a small square lockup — the PNG wordmark
 * is rectangular and doesn't suit a square-icon slot.
 */
export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--color-ink-light)" />
      <path
        d="M20 8.5v10.25c0 2.9-2.3 5.25-5.15 5.25-2.2 0-4.1-1.4-4.85-3.4"
        stroke="#5b7cff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M14.5 13.25h9" stroke="#32d583" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="20" cy="8.5" r="0.2" fill="#5b7cff" />
    </svg>
  );
}

/**
 * The full JustPae wordmark — now uses the brand-supplied PNG assets.
 * jp-wordmark-light shows the black PNG in light mode.
 * jp-wordmark-dark shows the white PNG in dark mode.
 * Both classes are defined in globals.css and follow the same
 * data-theme / prefers-color-scheme contract as all other tokens.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      {/* Black wordmark — visible in light mode */}
      <Image
        src="/JP-Wordmark-black.png"
        alt="JustPae"
        width={120}
        height={36}
        priority
        className="jp-wordmark-light h-8 w-auto"
      />
      {/* White wordmark — visible in dark mode */}
      <Image
        src="/JP-Wordmark-white.png"
        alt="JustPae"
        width={120}
        height={36}
        priority
        className="jp-wordmark-dark h-8 w-auto"
      />
    </span>
  );
}

