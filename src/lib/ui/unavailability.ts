/**
 * GROUP 4f — the SHORT WORD for "you can't pick this", and the rule that
 * there is never only one of them.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES
 *
 * Three pickers appended a bare `· unavailable` to every option they
 * disabled, and the rate board printed a bare `Unavailable` for every pair it
 * could not price. In both cases the specific reason was already in hand at
 * the call site and thrown away:
 *
 *   DepositForm.tsx   `{info?.available ? "" : " · unavailable"}`
 *   ConvertForm.tsx   `{blocked ? " · unavailable" : ""}`
 *   BuySellRates.tsx  `<span>Unavailable</span>`
 *
 * "Unavailable" carries no information. Broken? Not for me? Never going to
 * work? For a Ghanaian holding cedis — the person who meets this state most
 * often on this product — it is indistinguishable from "justpae does not do
 * your currency", which is both untrue and the kind of untrue that loses
 * somebody permanently.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS IS AN ENUM AND NOT JUST THE WORD "MAINTENANCE" EVERYWHERE
 *
 * The obvious fix — swap every "unavailable" for "Maintenance" — would be a
 * second lie with better manners. Only SOME of these states are maintenance:
 *
 *   maintenance   A route this product offers, down right now, coming back.
 *                 GHS deposit (its provider's account is not cleared) and any
 *                 USDT pair the liquidity provider stops quoting.
 *   receive       USD in. Not down, not coming: dollars arrive by someone
 *                 sending them to receiving details. There is no deposit to
 *                 fix.
 *   convert       CNY in. Yuan has no pay-in rail and never has — the balance
 *                 exists because somebody converted into it.
 *   unsupported   A standing fact about this account, not a passing outage.
 *                 USD conversion has no leg anywhere, and a CNY withdrawal is
 *                 refused by a database trigger (migration 0026).
 *   setup         Nothing is wrong with the currency — the USER has not
 *                 finished something. A withdrawal with no saved payout
 *                 destination is the whole of this case.
 *   same          The source and destination wallet are the same one.
 *
 * Calling `setup` "Maintenance" would send somebody to support over a missing
 * bank account. Calling `unsupported` "Maintenance" promises a return date
 * that does not exist. The distinction the brief asks for — a currency off
 * because its flag is off versus one genuinely under maintenance — is exactly
 * the distinction between the last four of these and the first.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE LABELS ARE ONE WORD EACH, BECAUSE OF WHERE THEY GO
 *
 * A `<select>` option is the tightest copy surface in the product: on a 375px
 * screen the option already carries a flag, a currency code and often a
 * balance. There is room for one word. The word is a POINTER, not the
 * explanation — every surface using it also has the full sentence available
 * (the deposit banner, the account-page reason sheet, the rate board's own
 * second line), and these labels are deliberately chosen so the one word
 * tells the user which of those to read.
 *
 * `Maintenance` matches MaintenanceBadge exactly. It has to: the same state
 * must not read as a badge in one place and a different word in another.
 */

/** The reasons an option, a pair or an action can be closed to a user. */
export type UnavailableKind =
  | "maintenance"
  | "receive"
  | "convert"
  | "unsupported"
  | "setup"
  | "same";

/**
 * The one word. Shared by MaintenanceBadge (so the badge and the suffix can
 * never drift apart) and by every picker suffix.
 */
export const UNAVAILABLE_LABEL: Record<UnavailableKind, string> = {
  maintenance: "Maintenance",
  receive: "Receive",
  convert: "Convert",
  unsupported: "Unsupported",
  setup: "Setup",
  same: "Same",
};

/** The word itself, for the many places that only ever mean this one. */
export const MAINTENANCE_LABEL = UNAVAILABLE_LABEL.maintenance;

/** `" · Maintenance"`, ready to append inside an `<option>`'s text. */
export function unavailableSuffix(kind: UnavailableKind): string {
  return ` · ${UNAVAILABLE_LABEL[kind]}`;
}
