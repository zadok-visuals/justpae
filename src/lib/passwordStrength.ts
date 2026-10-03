/**
 * Shared between the signup form (live feedback as the user types) and the
 * signUp/resetPassword server actions (the actual gate). Importing one
 * function into both means the server can never reject a password the client
 * showed as acceptable, or accept one the client flagged as weak.
 */

export type PasswordStrengthLabel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrengthResult {
  /** 0-4, for rendering a segmented meter. */
  score: number;
  label: PasswordStrengthLabel;
  /** What the server actually enforces. */
  meetsMinimum: boolean;
}

export const PASSWORD_MIN_LENGTH = 8;

export function assessPasswordStrength(password: string): PasswordStrengthResult {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;

  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  if (password.length >= 12) score++;
  if (classes >= 2) score++;
  if (classes >= 3) score++;

  const label: PasswordStrengthLabel =
    score <= 1 ? "weak" : score === 2 ? "fair" : score === 3 ? "good" : "strong";

  // The floor: long enough, and not just one repeated character class (so
  // "aaaaaaaa" fails on class count even though it clears the length bar).
  const meetsMinimum = password.length >= PASSWORD_MIN_LENGTH && classes >= 2;

  return { score, label, meetsMinimum };
}

export const PASSWORD_REQUIREMENT_HINT =
  "At least 8 characters, mixing letters, numbers or symbols";
