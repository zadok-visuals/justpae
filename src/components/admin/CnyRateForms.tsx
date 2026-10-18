"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { SelectField, TextField, FieldError } from "@/components/ui/Field";
import { Banner, Card } from "@/components/ui/Primitives";
import {
  setCnyTierRate,
  deleteCnyTierRate,
  setCnyMarkupRate,
  setSupplierRate,
} from "@/lib/actions/adminCnyRates";
import { CURRENCY_CODES, formatNumber } from "@/lib/currencies";
import type { CnyMarkupRate, CnyTierRate, SupplierRate } from "@/lib/types/database";

/**
 * The three forms that price CNY.
 *
 * They are separate because they answer separate questions, on different
 * cadences: the ladder changes when the supplier's volume terms change, the
 * markup when the commercial agreement does, and a supplier rate every time
 * the operator actually buys. Folding them into one form would mean one save
 * button for three unrelated decisions.
 */

/**
 * THE LADDER. Prices every yuan movement in the app and is never shown to a
 * customer — the table it writes has RLS on and no read policy at all, so
 * that is a property of the schema rather than a convention this form has to
 * remember (see migration 0026).
 */
export function CnyTierRateForm({ tiers }: { tiers: CnyTierRate[] }) {
  const [state, formAction] = useActionState(setCnyTierRate, {});
  const [deleteState, deleteAction] = useActionState(deleteCnyTierRate, {});

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Yuan rate bands</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          CNY per 1 USDT, by order size. Bigger orders buy at a better rate. Customers never see
          these bands — they see the price the band produces.
        </p>
      </div>

      {state.ok && <Banner tone="success" title="Band saved" />}
      {deleteState.ok && <Banner tone="success" title="Band removed" />}

      {tiers.length > 0 && (
        <div className="scroll-x">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="pb-2 font-medium">
                  Band (CNY)
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  CNY per USDT
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.tier_min_cny} className="border-b border-border last:border-0">
                  <td className="py-2 tabular-nums text-foreground">
                    {formatNumber(Number(tier.tier_min_cny), 0)} –{" "}
                    {formatNumber(Number(tier.tier_max_cny), 0)}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-foreground">
                    {formatNumber(Number(tier.usdt_to_cny_rate), 4)}
                  </td>
                  <td className="py-2 text-right">
                    <form action={deleteAction}>
                      <input type="hidden" name="tierMin" value={tier.tier_min_cny} />
                      <SubmitButton
                        variant="secondary"
                        size="sm"
                        fullWidth={false}
                        pendingLabel="…"
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <FieldError>{deleteState.error}</FieldError>

      <form action={formAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            name="tierMin"
            label="From (CNY)"
            inputMode="decimal"
            required
            placeholder="0"
            defaultValue={state.values?.tierMin ?? ""}
          />
          <TextField
            name="tierMax"
            label="Up to (CNY)"
            inputMode="decimal"
            required
            placeholder="999"
            defaultValue={state.values?.tierMax ?? ""}
          />
        </div>
        <TextField
          name="rate"
          label="CNY per 1 USDT"
          inputMode="decimal"
          required
          placeholder="6.60"
          defaultValue={state.values?.rate ?? ""}
          hint="Saving an existing lower bound replaces that band"
          error={state.error}
        />
        <SubmitButton pendingLabel="Saving…">Save band</SubmitButton>
      </form>
    </Card>
  );
}

/**
 * THE MARKUP, split by what the customer is paying with.
 *
 * Two values rather than one because a fiat payer and a USDT payer carry
 * genuinely different agreed spreads. Collapsing them into a single figure is
 * a regression the reference implementation made and then had to undo.
 */
export function CnyMarkupForm({ markup }: { markup: CnyMarkupRate | null }) {
  const [state, formAction] = useActionState(setCnyMarkupRate, {});

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Yuan markup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Taken off what the customer receives, on top of the band rate. Convert and Pay to China
          both read these, so they cannot drift apart.
        </p>
      </div>

      {state.ok && <Banner tone="success" title="Markup updated" />}

      <form action={formAction} className="space-y-3">
        <TextField
          name="fiatPercent"
          label="Paying with naira, shillings or cedis"
          inputMode="decimal"
          required
          trailing="%"
          placeholder="2"
          defaultValue={
            state.values?.fiatPercent ??
            (markup ? String(Number(markup.fiat_markup_rate) * 100) : "")
          }
        />
        <TextField
          name="usdtPercent"
          label="Paying with USDT"
          inputMode="decimal"
          required
          trailing="%"
          placeholder="1"
          defaultValue={
            state.values?.usdtPercent ??
            (markup ? String(Number(markup.usdt_markup_rate) * 100) : "")
          }
          error={state.error}
        />
        <SubmitButton pendingLabel="Saving…">Save markup</SubmitButton>
      </form>
    </Card>
  );
}

/**
 * WHAT WE ACTUALLY PAY, as distinct from what we charge.
 *
 * Append-only: each save is a new row with its own effective date, and old
 * rows stay. Overwriting would silently rewrite every historical margin in
 * the PNL report, which is the one number this whole table exists to make
 * trustworthy.
 */
export function SupplierRateForm({ rates }: { rates: SupplierRate[] }) {
  const [state, formAction] = useActionState(setSupplierRate, {});

  const pairs = CURRENCY_CODES.flatMap((base) =>
    CURRENCY_CODES.filter((quote) => quote !== base).map((quote) => `${base}/${quote}`),
  );

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Supplier rates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What one unit of the base currency costs us, in the quote currency. Each save is a new
          dated entry — margin on an old order is worked out at the rate that was in force then.
        </p>
      </div>

      {state.ok && <Banner tone="success" title="Supplier rate recorded" />}

      <form action={formAction} className="space-y-3">
        <SelectField name="pair" label="Pair" required defaultValue={state.values?.pair ?? "USDT/CNY"}>
          {pairs.map((pair) => (
            <option key={pair} value={pair}>
              {pair.replace("/", " → ")}
            </option>
          ))}
        </SelectField>

        <TextField
          name="rate"
          label="Quote per 1 base"
          inputMode="decimal"
          required
          placeholder="6.45"
          defaultValue={state.values?.rate ?? ""}
        />

        <TextField
          name="effectiveFrom"
          label="In force from"
          type="datetime-local"
          hint="Leave blank for now. Backdate it if the rate started earlier."
          defaultValue={state.values?.effectiveFrom ?? ""}
          error={state.error}
        />

        <SubmitButton pendingLabel="Saving…">Record rate</SubmitButton>
      </form>

      {rates.length > 0 && (
        <div className="scroll-x">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="pb-2 font-medium">
                  Pair
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Rate
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  From
                </th>
              </tr>
            </thead>
            <tbody>
              {rates.slice(0, 12).map((rate) => (
                <tr key={rate.id} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium text-foreground">
                    {rate.base_currency} → {rate.quote_currency}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-foreground">
                    {formatNumber(Number(rate.buy_rate), 4)}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {new Date(rate.effective_from).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
