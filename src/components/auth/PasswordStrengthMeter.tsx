"use client";

import { assessPasswordStrength, type PasswordStrengthLabel } from "@/lib/passwordStrength";

const FILL: Record<PasswordStrengthLabel, string> = {
  weak: "bg-destructive",
  fair: "bg-primary/60",
  good: "bg-primary",
  strong: "bg-success",
};

const COPY: Record<PasswordStrengthLabel, string> = {
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

/** Renders nothing until the user types — an empty field is not "weak". */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const { score, label } = assessPasswordStrength(password);

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`h-1 flex-1 rounded-full transition-colors ${
              segment < score ? FILL[label] : "bg-border"
            }`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Password strength: <span className="font-medium text-foreground">{COPY[label]}</span>
      </p>
    </div>
  );
}
