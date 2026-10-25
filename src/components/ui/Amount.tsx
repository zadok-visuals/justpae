import { splitAmount } from "@/lib/currencies";
import type { Currency } from "@/lib/types/database";

/**
 * THE way a balance or a total is drawn. One component, so the three sizes a
 * money figure has — the ISO code, the whole number, the decimals — stay in
 * the same proportion on Home, on /accounts, in a sheet and in admin.
 *
 * Everything is sized in `em`, so the caller sets ONE font size on the
 * wrapper (`text-4xl`, `text-xl`, …) and the three parts scale together.
 *
 * Hidden balances render "NGN ••••" rather than bare dots: the currency is
 * not the secret, the figure is, and dropping the code makes the switcher
 * above it look broken.
 */
export function Amount({
  currency,
  amount,
  hidden = false,
  sign,
  className = "",
  codeClassName = "text-muted-foreground",
}: {
  currency: Currency;
  amount: number;
  hidden?: boolean;
  /** Transaction rows only: "+" for money in, "−" for money out. */
  sign?: "in" | "out";
  /** Sets the base size, e.g. "text-4xl". The parts scale off it. */
  className?: string;
  /** Overridden on the blue balance card, where secondary text is white/80. */
  codeClassName?: string;
}) {
  const { code, whole, decimals } = splitAmount(currency, amount);

  return (
    <span className={`inline-flex items-baseline gap-[0.22em] tabular-nums ${className}`}>
      <span className={`text-[0.45em] font-medium tracking-wide ${codeClassName}`}>{code}</span>

      {hidden ? (
        <span className="font-bold leading-none tracking-[0.08em]" aria-label="Amount hidden">
          ••••
        </span>
      ) : (
        <span className="font-bold leading-none">
          {sign === "in" ? "+" : sign === "out" ? "−" : null}
          {whole}
          {decimals && (
            <span
              className="text-[0.6em] font-semibold"
              // Raised a little so the decimals sit against the cap height of
              // the whole number rather than dangling off its baseline.
              style={{ verticalAlign: "0.22em" }}
            >
              .{decimals}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
