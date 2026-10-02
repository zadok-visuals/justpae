"use client";

import { useFormStatus } from "react-dom";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-gold-light disabled:bg-primary/40 disabled:text-primary-foreground/60",
  secondary:
    "bg-secondary text-secondary-foreground border border-border hover:bg-accent disabled:opacity-50",
  ghost: "text-foreground hover:bg-accent disabled:opacity-50",
  danger:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  // 44px minimum touch target on every size — anything smaller is a miss on a
  // phone however neat it looks on a desktop.
  sm: "h-11 px-3 text-sm rounded-md",
  md: "h-12 px-4 text-sm rounded-lg",
  lg: "h-14 px-5 text-base rounded-lg",
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
      className={`inline-flex items-center justify-center gap-2 font-medium disabled:cursor-not-allowed ${
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
