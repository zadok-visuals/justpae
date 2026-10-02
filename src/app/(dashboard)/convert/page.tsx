import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { ConvertForm } from "@/components/convert/ConvertForm";
import { EmptyState } from "@/components/ui/Primitives";
import { listRoutesFrom } from "@/lib/actions/convert";
import type { Wallet } from "@/lib/types/database";

export const metadata = { title: "Convert" };
export const dynamic = "force-dynamic";

export default async function ConvertPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: wallets }, { data: pin }] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id),
    supabase.from("withdrawal_pins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  const list = (wallets ?? []) as Wallet[];

  if (list.length < 2) {
    return (
      <PageShell title="Convert">
        <EmptyState
          title="You need two wallets to convert"
          body="Every account gets a dollar and a USDT wallet, plus a local one for your country. If something looks missing, contact support."
          action={{ href: "/home", label: "Back to home" }}
        />
      </PageShell>
    );
  }

  // Route availability is resolved for the FIRST wallet on the server so the
  // form opens with a usable pair already selected. Changing the source
  // refreshes the page, which re-resolves for the new source — the
  // alternative is resolving every source's routes up front, which is one
  // live provider lookup per pair on every page view.
  const routes = await listRoutesFrom(list[0].currency);

  return (
    <PageShell
      title="Convert"
      subtitle="Move money between your wallets at live rates."
      back={{ href: "/home", label: "Home" }}
    >
      <ConvertForm wallets={list} routes={routes} hasPin={pin != null} />
    </PageShell>
  );
}
