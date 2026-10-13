import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

// Next.js only inlines a NEXT_PUBLIC_ variable into the browser bundle when
// the reference is a literal `process.env.NEXT_PUBLIC_X` it can find by
// static analysis. requireEnv("NEXT_PUBLIC_X") reads process.env[name] —
// dynamic indexing, invisible to that analysis — so in the browser it always
// resolves to undefined, whatever Vercel has set. Each one has to be spelled
// out literally here, the one file that actually runs client-side.
function requireBrowserEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in Vercel (Project Settings → Environment Variables) or .env.local for local development.`,
    );
  }
  return value;
}

export function createClient() {
  return createBrowserClient<Database>(
    requireBrowserEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireBrowserEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
