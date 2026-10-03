/**
 * Supabase env vars were read with a non-null assertion (`!`) in four
 * places. That's a silent lie to the type checker — a missing var doesn't
 * fail here, it fails later as `supabase.co/undefined` or a generic 500,
 * with nothing in the error pointing back to the actual cause. This throws
 * immediately, naming exactly which variable is missing.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in Vercel (Project Settings → Environment Variables) or .env.local for local development.`,
    );
  }
  return value;
}
