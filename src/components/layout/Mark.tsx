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
 * JP-Wordmark-black.png is shown in light mode; JP-Wordmark-white.png in dark.
 * Both are served from /public so they resolve to /JP-Wordmark-*.png.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      {/* Light-mode wordmark */}
      <Image
        src="/JP-Wordmark-black.png"
        alt="JustPae"
        width={120}
        height={36}
        priority
        className="block dark:hidden h-8 w-auto"
      />
      {/* Dark-mode wordmark */}
      <Image
        src="/JP-Wordmark-white.png"
        alt="JustPae"
        width={120}
        height={36}
        priority
        className="hidden dark:block h-8 w-auto"
      />
    </span>
  );
}

