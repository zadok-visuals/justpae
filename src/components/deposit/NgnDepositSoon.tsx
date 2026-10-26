import Link from "next/link";
import { Card } from "@/components/ui/Primitives";

/**
 * Naira deposits, before either naira rail is on.
 *
 * Its own early-return branch, like the manual and Korapay rails beside it —
 * there is no amount to type and no quote to show, so the usual three-step
 * form has nothing to do here.
 */
export function NgnDepositSoon({
  picker,
  isAdmin,
}: {
  picker: React.ReactNode;
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-4">
      {picker}

      <Card className="space-y-4">
        <p className="text-sm text-foreground">
          Naira deposits are coming soon. You can deposit USDT in the meantime.
        </p>
        <Link
          href="/deposit?currency=USDT"
          className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Deposit USDT
        </Link>
        {isAdmin && (
          <p className="text-xs text-muted-foreground">
            Admin: naira deposits turn on when KORAPAY_NGN_DEPOSIT is set with live Korapay
            keys.
          </p>
        )}
      </Card>
    </div>
  );
}
