import type { ActivityDetail } from "@/lib/activity/detail";

/**
 * What a receipt calls the thing it is a receipt for.
 *
 * Shared between the detail sheet (which has always had a title, passed down
 * from the row the user tapped) and the PNG route (which has no such caller
 * and must work it out from the row itself). Without this, the image's
 * heading and the sheet's heading drift apart and the customer's saved
 * receipt says something their screen never did.
 *
 * Customer copy rules apply: no provider name, and "convert" rather than
 * "exchange".
 *
 * GROUP 7. `status` matters for exactly one branch: a deposit. "Money added"
 * is an outcome, not a category — true only once the money is actually in
 * the wallet — and a failed or expired deposit's receipt said it anyway,
 * printed right above a status pill reading "Failed". Every other title here
 * ("Conversion", "Withdrawal", "Airtime"…) names what KIND of thing this is
 * rather than claiming an outcome, so the status pill beside it is the only
 * place those need to say how it went.
 */
export function receiptTitle(detail: Pick<ActivityDetail, "source" | "type" | "status">): string {
  if (detail.source === "deposit") {
    switch (detail.status) {
      case "completed":
        return "Money added";
      case "failed":
        return "Deposit failed";
      case "expired":
        return "Deposit expired";
      // 0036. "Deposit pending" would be wrong in the one way that matters:
      // pending means we are waiting on the customer, and here they have
      // already made the transfer.
      case "awaiting_review":
        return "Deposit under review";
      default:
        return "Deposit pending";
    }
  }
  if (detail.source === "bill") {
    switch (detail.type) {
      case "airtime":
        return "Airtime";
      case "data":
        return "Data bundle";
      case "electricity":
        return "Electricity";
      case "cable_tv":
        return "Cable TV";
      case "water":
        return "Water";
      case "education":
        return "Education";
      default:
        return "Bill payment";
    }
  }

  switch (detail.type) {
    case "convert":
      return "Conversion";
    case "withdrawal":
      return "Withdrawal";
    case "pay_to_china":
      return "Pay to China";
    default:
      return "Transaction";
  }
}

/**
 * The filename the browser saves. `justpae-receipt-<reference>.png`, with the
 * reference falling back to the row's own id when a provider never issued one
 * — a file called `justpae-receipt-null.png` is worse than a long one, and
 * two receipts that overwrite each other in a Downloads folder are worse
 * still.
 */
export function receiptFilename(reference: string | null, fallbackId: string): string {
  const safe = (reference ?? fallbackId).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
  return `justpae-receipt-${safe}.png`;
}
