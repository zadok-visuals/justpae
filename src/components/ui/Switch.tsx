"use client";

/**
 * The one on/off switch in the app.
 *
 * The geometry is the whole point of it existing. Every copy of this control
 * had its own numbers, and the Product-update-emails one put an absolutely
 * positioned knob inside a button with no `left` — so it resolved against the
 * static position, started mid-track, and sat outside the track when on. Here
 * the knob is pinned at left-0.5/top-0.5 and moves by translate-x-5 inside a
 * h-7 w-12 track: 2px inset on both ends, at both positions.
 *
 * The outer button is 44px tall so the tap target clears the minimum even
 * though the track is 28px.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  name,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Announced by a screen reader when the switch has no visible <label> text. */
  label?: string;
  /** Set to also post the value with a plain form: "on" when checked, "" when not. */
  name?: string;
  className?: string;
}) {
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-11 w-12 shrink-0 items-center disabled:opacity-60 ${className}`}
      >
        <span
          aria-hidden="true"
          className={`relative block h-7 w-12 rounded-full transition-colors ${
            // No border on the off track: a 1px border would shrink the
            // padding box the knob is positioned in, and the 2px inset would
            // stop being equal at both ends.
            checked ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 size-6 rounded-full bg-white transition-transform ${
              checked ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </span>
      </button>
      {name && <input type="hidden" name={name} value={checked ? "on" : ""} />}
    </>
  );
}
