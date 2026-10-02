/**
 * The justpae mark and wordmark.
 *
 * Drawn here rather than loaded as an image so it inherits the gold token and
 * scales without a second asset at 2x. The form is a "j" descender crossing a
 * horizontal rail — a currency-glyph gesture, not a letterform borrowed from
 * anywhere else.
 */
export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--color-ink-light)" />
      <path
        d="M20 8.5v10.25c0 2.9-2.3 5.25-5.15 5.25-2.2 0-4.1-1.4-4.85-3.4"
        stroke="var(--color-gold)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M14.5 13.25h9" stroke="var(--color-naira)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="20" cy="8.5" r="0.2" fill="var(--color-gold)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark />
      {/* Lowercase, always — it is the brand's own spelling, not a style
          choice to be normalised by a heading rule. */}
      <span className="font-display text-xl font-semibold tracking-tight text-foreground">
        justpae
      </span>
    </span>
  );
}
