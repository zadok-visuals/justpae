import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";
import { requireEnv } from "@/lib/supabase/env";

export async function createClient() {
  // Next.js 16: cookies() is async-only — synchronous access was removed.
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where the cookie store is
            // read-only. A Server Function or the proxy refreshes the session
            // cookie instead, so swallowing this is correct.
          }
        },
      },
    },
  );
}
