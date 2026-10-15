import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/layout/PageShell";
import { Card, DetailRow, SectionHeader } from "@/components/ui/Primitives";
import { localCurrencyForCountry, currencyMeta, formatAmount } from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";
import { depositAvailability } from "@/lib/deposits/availability";

export const metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

const WASHES: Record<Currency, string> = {
  USD: "from-naira/25 to-card",
  NGN: "from-gold/25 to-card",
  GHS: "from-gold-dark/30 to-card",
  KES: "from-naira-light/20 to-card",
  USDT: "from-ink-raised to-card",
};

const ORDER: Currency[] = ["USD", "NGN", "GHS", "KES", "USDT"];
function orderIndex(currency: Currency): number {
  const index = ORDER.indexOf(currency);
  return index === -1 ? ORDER.length : index;
}

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: wallets } = await supabase.from("wallets").select("*").eq("user_id", user.id);

  // Auto-provision wallets if the signup trigger didn't run.
  if (!wallets || wallets.length === 0) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("country")
      .eq("id", user.id)
      .maybeSingle();

    const localCurrency = localCurrencyForCountry(profile?.country);
    const walletsToCreate: { user_id: string; currency: Currency }[] = [
      { user_id: user.id, currency: "USD" },
      { user_id: user.id, currency: "USDT" },
    ];
    if (localCurrency) {
      walletsToCreate.push({ user_id: user.id, currency: localCurrency });
    }
    await admin.from("wallets").upsert(walletsToCreate, { onConflict: "user_id,currency" });
    const { data: refreshed } = await supabase.from("wallets").select("*").eq("user_id", user.id);
    wallets = refreshed;
  }

  const list = ([...(wallets ?? [])] as Wallet[]).sort(
    (a, b) => orderIndex(a.currency) - orderIndex(b.currency),
  );

  const totalUsd = list.reduce((sum, w) => {
    // Only sum fiat wallets we can approximate; USDT ≈ 1 USD
    if (w.currency === "USD") return sum + w.balance;
    if (w.currency === "USDT") return sum + w.balance;
    return sum;
  }, 0);

  return (
    <PageShell title="Accounts" back={{ href: "/home", label: "Home" }}>
      <div className="space-y-6">
        {/* Portfolio summary */}
        <Card className="bg-gradient-to-br from-gold/10 to-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Digital assets
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-foreground">
            ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            USD + USDT balance (other currencies excluded)
          </p>
        </Card>

        {/* Per-wallet cards */}
        <section>
          <SectionHeader title="Your wallets" />
          <div className="space-y-3">
            {list.map((wallet) => {
              const meta = currencyMeta(wallet.currency);
              const avail = depositAvailability(wallet.currency);
              const canDeposit = avail.available;

              return (
                <article
                  key={wallet.currency}
                  className={`rounded-xl border border-border bg-gradient-to-br p-4 ${WASHES[wallet.currency]}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-xl leading-none">
                        {meta.flag}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{wallet.currency}</p>
                        <p className="text-xs text-muted-foreground">{meta.label}</p>
                      </div>
                    </div>
                    <p className="font-display text-xl font-semibold tabular-nums text-foreground">
                      {formatAmount(wallet.currency, wallet.balance)}
                    </p>
                  </div>

                  <div className="mt-3 flex gap-2">
                    {canDeposit ? (
                      <Link
                        href="/deposit"
                        className="flex-1 rounded-lg border border-border bg-card/60 py-2 text-center text-xs font-semibold text-foreground hover:bg-card"
                      >
                        + Add money
                      </Link>
                    ) : (
                      <span className="flex-1 rounded-lg border border-border bg-card/30 py-2 text-center text-xs text-muted-foreground">
                        Deposit unavailable
                      </span>
                    )}
                    <Link
                      href="/withdraw"
                      className="flex-1 rounded-lg border border-border bg-card/60 py-2 text-center text-xs font-semibold text-foreground hover:bg-card"
                    >
                      Withdraw
                    </Link>
                    <Link
                      href="/convert"
                      className="flex-1 rounded-lg border border-border bg-card/60 py-2 text-center text-xs font-semibold text-foreground hover:bg-card"
                    >
                      Convert
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Actions */}
        <section>
          <SectionHeader title="More" />
          <Card className="divide-y divide-border">
            <DetailRow label="Receive USD">
              <Link href="/receive" className="text-primary text-sm font-medium">
                View details →
              </Link>
            </DetailRow>
            <DetailRow label="Transaction history">
              <Link href="/transactions" className="text-primary text-sm font-medium">
                See all →
              </Link>
            </DetailRow>
            <DetailRow label="Payout destinations">
              <Link href="/profile" className="text-primary text-sm font-medium">
                Manage →
              </Link>
            </DetailRow>
          </Card>
        </section>
      </div>
    </PageShell>
  );
}
