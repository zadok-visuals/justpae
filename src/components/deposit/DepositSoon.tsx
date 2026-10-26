import Link from "next/link";
import { Card } from "@/components/ui/Primitives";

/**
 * GROUP 2 — any currency whose deposit rail is "soon" (not open yet, no
 * outage to come back from), generalised from the naira-only version this
 * replaced. NGN and KES both land here today.
 *
 * Its own early-return branch, like the manual and Korapay rails beside it —
 * there is no amount to type and no quote to show, so the usual three-step
 * form has nothing to do here.
 */
export function DepositSoon({
  reason,
  picker,
  showAdminNote,
}: {
  /** depositAvailability's own sentence for this currency — not retyped. */
  reason: string;
  picker: React.ReactNode;
  /** Only ever true for NGN: the note names Korapay specifically. */
  showAdminNote: boolean;
}) {
  return (
    <div className="space-y-4">
      {picker}

      <Card className="space-y-4">
        <p className="text-sm text-foreground">{reason}</p>
        <Link
          href="/deposit?currency=USDT"
          className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Deposit USDT instead
        </Link>
        {showAdminNote && (
          <p className="text-xs text-muted-foreground">
            Admin: naira deposits turn on when KORAPAY_NGN_DEPOSIT is set with live Korapay
            keys.
          </p>
        )}
      </Card>
    </div>
  );
}
