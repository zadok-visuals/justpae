import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The root is a router, not a page.
 *
 * There is NO marketing site here deliberately — this is the product. Someone
 * arriving at the root either has a session, in which case they want their
 * money, or they do not, in which case they want to sign in.
 *
 * The proxy already redirects both cases. This exists because a route that
 * depends on proxy behaviour to never render is a route that renders the first
 * time the proxy matcher changes.
 */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/home" : "/login");
}
