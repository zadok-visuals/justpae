"use client";

import { useId, useState } from "react";

/**
 * Form primitives.
 *
 * All of them wrap their control in `.jp-field` and keep the control's own
 * focus ring suppressed — globals.css does the real work. The rule that
 * matters: ONE focus indicator. The pre-rebuild app combined a border colour
 * change with an offset ring and drew two visibly separate boxes around a
 * focused input.
 */

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {children}
      </label>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-sm text-destructive">
      {children}
    </p>
  );
}

const FIELD_SHELL =
  "jp-field flex items-center gap-2 rounded-lg border border-input bg-secondary px-3";

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export function TextField({
  label,
  hint,
  error,
  prefix,
  suffix,
  className = "",
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <div className={`${FIELD_SHELL} h-12`}>
        {prefix && <span className="shrink-0 text-muted-foreground">{prefix}</span>}
        <input
          {...props}
          id={id}
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 border-0 bg-transparent py-0 text-foreground placeholder:text-muted-foreground"
        />
        {suffix && <span className="shrink-0 text-muted-foreground">{suffix}</span>}
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function PasswordField({
  label,
  hint,
  error,
  className = "",
  ...props
}: Omit<TextFieldProps, "prefix" | "suffix" | "type">) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <div className={`${FIELD_SHELL} h-12`}>
        <input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 border-0 bg-transparent py-0 text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // The toggle is not a tab stop: a keyboard user moving through a
          // login form wants to land on the next field, not on a show/hide
          // control. It stays reachable to a screen reader and to a pointer.
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          className="shrink-0 px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  className = "",
  children,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <div className={`${FIELD_SHELL} h-12`}>
        <select
          {...props}
          id={id}
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 appearance-none border-0 bg-transparent py-0 text-foreground"
        >
          {children}
        </select>
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
          ▾
        </span>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <div className={`${FIELD_SHELL} py-2.5`}>
        <textarea
          {...props}
          id={id}
          aria-invalid={error ? true : undefined}
          className="min-h-20 min-w-0 flex-1 resize-y border-0 bg-transparent text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function FileField({
  label,
  hint,
  error,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <label
        htmlFor={id}
        className="jp-field flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input bg-secondary px-4 py-4 text-center"
      >
        <span className="text-sm font-medium text-foreground">
          {fileName ?? "Tap to choose a file"}
        </span>
        <span className="text-xs text-muted-foreground">JPG, PNG, HEIC or PDF · up to 10MB</span>
        <input
          {...props}
          id={id}
          type="file"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="sr-only"
        />
      </label>
      <FieldError>{error}</FieldError>
    </div>
  );
}
