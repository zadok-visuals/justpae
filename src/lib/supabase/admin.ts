import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { requireEnv } from "@/lib/supabase/env";

/**
 * Server-only. Bypasses RLS entirely — never import this into a Client
 * Component, and never into a module a Client Component imports. Used by the
 * webhook receivers, the cron reconcilers, the automated-payout path and the
 * admin-gated server actions; nothing else.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
