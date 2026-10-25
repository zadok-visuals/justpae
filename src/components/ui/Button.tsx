"use client";

import { useFormStatus } from "react-dom";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-button hover:bg-primary-hover active:bg-primary-pressed " +
    "disabled:bg-primary/40 disabled:text-primary-foreground/60 disabled:shadow-none",
  // Card, not the muted grey it used to be: a secondary button sits ON the
  // page ground, and a grey fill on a grey ground is a button-shaped hole.
  secondary:
    "bg-card text-foreground border border-border hover:bg-accent active:bg-accent disabled:opacity-50",
  ghost: "text-primary hover:bg-primary-soft active:bg-primary-soft disabled:opacity-50",
  danger:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 disabled:opacity-50",
};

// Pills. 44px minimum touch target on every size — anything smaller is a miss
// on a phone however neat it looks on a desktop — and 48px for the default,
// which is the one a form's main action uses.
const SIZES: Record<Size, string> = {
  sm: "h-11 px-4 text-sm rounded-full",
  md: "h-12 px-5 text-sm rounded-full",
  lg: "h-12 px-6 text-base rounded-full",
};

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed ${
        VARIANTS[variant]
      } ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/**
 * The submit button for any <form action={serverAction}>.
 *
 * useFormStatus reads the pending state of the form this button is inside, so
 * it disables and spins without the page needing its own `submitting` state.
 * That matters because the hand-rolled version is the one that gets forgotten
 * and lets a user double-submit a transfer.
 *
 * MUST be rendered inside the form it submits — useFormStatus returns the
 * status of the nearest parent form, so a button outside one always reads
 * pending: false.
 */
export function SubmitButton({
  children,
  variant = "primary",
  size = "lg",
  fullWidth = true,
  disabled,
  className = "",
  pendingLabel,
}: {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  /** Shown while submitting, e.g. "Converting…" instead of "Convert". */
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      loading={pending}
      disabled={disabled}
      className={className}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
