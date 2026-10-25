"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { SelectField, FieldError } from "@/components/ui/Field";
import { Banner, Card } from "@/components/ui/Primitives";
import { setPayoutRoute } from "@/lib/actions/adminKorapay";
import { parsePayoutRoute } from "@/lib/withdrawals/route";

/**
 * Which provider pays naira and shillings out.
 *
 * ADMIN-ONLY SURFACE, which is the one place in this product where a provider
 * is named out loud. The customer-facing copy rule ("never a provider name")
 * protects customers from a vendor relationship they did not sign up to; an
 * operator choosing between two vendors cannot do that job with the words
 * "primary" and "secondary" in front of them at 2am.
 *
 * ONE FORM PER CURRENCY, so saving naira cannot silently rewrite shillings.
 * The two rails fail independently and get switched independently.
 */
export function PayoutRouteForm({
  routes,
  flagEnabled,
}: {
  routes: Record<"NGN" | "KES", string | null>;
  flagEnabled: boolean;
}) {
  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Payout routing</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Which provider sends customer withdrawals out. Busha is the default for every
          currency and is what an unset or unreadable value falls back to.
        </p>
      </div>

      {!flagEnabled && (
        <Banner tone="warning" title="Korapay payouts are switched off for this deployment">
          A route saved here is stored but not used until
          NEXT_PUBLIC_FEATURE_KORAPAY_PAYOUTS is set. Both have to agree before a payout
          leaves through Korapay.
        </Banner>
      )}

      {(["NGN", "KES"] as const).map((currency) => (
        <CurrencyRoute key={currency} currency={currency} value={routes[currency]} />
      ))}
    </Card>
  );
}

function CurrencyRoute({ currency, value }: { currency: "NGN" | "KES"; value: string | null }) {
  const [state, action] = useActionState(setPayoutRoute, {});
  const current = parsePayoutRoute(value);

  return (
    <form action={action} className="space-y-2 border-t border-border pt-4 first:border-0 first:pt-0">
      <input type="hidden" name="currency" value={currency} />
      {state.ok && <Banner tone="success" title={state.message ?? "Saved"} />}
      <SelectField name="route" label={`${currency} payouts`} defaultValue={current}>
        <option value="busha">Busha (default)</option>
        <option value="korapay">Korapay</option>
      </SelectField>
      <SubmitButton size="sm" fullWidth={false} pendingLabel="Saving…">
        Save {currency} route
      </SubmitButton>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
