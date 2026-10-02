import type { Currency, WithdrawalRecipient } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";

/**
 * Server-only. Automated withdrawal payout on top of the generic Busha client.
 *
 * Shape: create a Recipient once per user per currency, then a payout Quote
 * whose source and target currency are the SAME (withdrawals here never
 * convert — the conversion flow is a separate product surface), carrying a
 * `pay_out` object, then execute it with the generic createTransfer.
 *
 * The channel mapping below is confirmed against the provider's own payout and
 * recipient reference for NGN (`ngn_bank`) and KES (`mpesa_mobile_money`) —
 * both documented with concrete example request bodies.
 *
 * GHS is deliberately ABSENT rather than guessed at: there is no documented
 * recipient type for it at all — no `ghs_bank`, no Ghana mobile-money example
 * anywhere in the public reference. A guessed type would fail at payout time,
 * after the user's balance has already been debited, which is the worst place
 * to discover it. With no channel, a GHS withdrawal routes to the manual queue
 * instead, which is a correct outcome rather than a broken one.
 *
 * USD is also absent: the provider has no USD payout channel on this account.
 * A USD balance is spent by converting it, not by withdrawing it directly.
 *
 * USDT uses the `crypto` type on network BSC. BSC does not appear in the
 * provider's payout examples (only ETH/BTC/XLM do) but it is the only network
 * this account's USDT balance accepts at all — TRC20 and ERC20 are both
 * rejected outright. This is the one entry in this map worth a live check
 * before real USDT withdrawals go out through it.
 */

interface PayoutChannel {
  recipientType: string;
  payOutType: string;
  /** ISO 3166-1 alpha-2 the provider expects on the recipient body. */
  countryCode?: string;
}

const PAYOUT_CHANNELS: Partial<Record<Currency, PayoutChannel>> = {
  NGN: { recipientType: "ngn_bank", payOutType: "bank_transfer", countryCode: "NG" },
  KES: { recipientType: "mpesa_mobile_money", payOutType: "mobile_money", countryCode: "KE" },
  USDT: { recipientType: "crypto", payOutType: "address" },
  // GHS and USD intentionally omitted — see the header comment.
};

export function getPayoutChannel(currency: Currency): PayoutChannel | null {
  return PAYOUT_CHANNELS[currency] ?? null;
}

/** Whether this currency can ever be paid out automatically, for UI copy. */
export function isAutomatablePayoutCurrency(currency: Currency): boolean {
  return getPayoutChannel(currency) != null;
}

/**
 * Creates a provider-side Recipient from the user's saved withdrawal_recipients
 * row. The caller caches the returned id on that row (busha_recipient_id) so
 * this runs once per user per currency, not once per withdrawal.
 *
 * NOT used for the crypto channel: per the provider's crypto-payout flow, a
 * crypto payout takes the address directly on the quote and uses no Recipient
 * at all.
 */
export async function createBushaRecipient(
  currency: Currency,
  recipient: WithdrawalRecipient,
): Promise<string> {
  const channel = getPayoutChannel(currency);
  if (!channel) throw new Error(`Automated payout isn't supported for ${currency} yet`);

  let body: Record<string, string>;

  if (channel.recipientType === "ngn_bank") {
    if (!recipient.bank_code || !recipient.bank_name || !recipient.bank_account_number) {
      throw new Error("Missing bank details for automated payout");
    }
    body = {
      type: channel.recipientType,
      currency,
      country_code: channel.countryCode!,
      bank_name: recipient.bank_name,
      // The provider's ngn_bank type expects its OWN internal bank codes, not
      // the standard NIBSS codes a general bank-list API returns — those are
      // rejected. getBanks() is the only correct source for this value.
      bank_code: recipient.bank_code,
      account_number: recipient.bank_account_number,
      account_name: recipient.account_holder_name,
    };
  } else if (channel.recipientType === "mpesa_mobile_money") {
    // KES payouts go to an M-Pesa phone number, which is stored in
    // bank_account_number — the column is the "destination identifier" for
    // whatever the corridor's rail is, not strictly a bank account.
    if (!recipient.bank_account_number) {
      throw new Error("Missing M-Pesa phone number for automated payout");
    }
    body = {
      type: channel.recipientType,
      currency,
      country_code: channel.countryCode!,
      phone_number: recipient.bank_account_number,
      account_name: recipient.account_holder_name,
    };
  } else {
    throw new Error(`createBushaRecipient is not used for the ${channel.recipientType} channel`);
  }

  const created = await busha.createRecipient(body);
  return created.id;
}

/**
 * Requests and immediately executes a payout transfer for the exact amount
 * being withdrawn.
 *
 * `recipientId` applies only to the bank_transfer / mobile_money channels. The
 * crypto channel skips Recipient creation entirely and builds its quote
 * straight from the saved wallet address and network.
 */
export async function createPayoutTransfer(
  currency: Currency,
  amount: number,
  recipient: WithdrawalRecipient,
  recipientId?: string,
): Promise<busha.BushaTransfer> {
  const channel = getPayoutChannel(currency);
  if (!channel) throw new Error(`Automated payout isn't supported for ${currency} yet`);

  const isCrypto = channel.recipientType === "crypto";
  if (isCrypto) {
    if (!recipient.wallet_address) throw new Error("Missing wallet address for automated payout");
  } else if (!recipientId) {
    throw new Error("Missing recipient id for automated payout");
  }

  const quote = await busha.createQuote({
    sourceCurrency: currency,
    targetCurrency: currency,
    targetAmount: amount.toFixed(2),
    payOut: isCrypto
      ? {
          type: channel.payOutType,
          address: recipient.wallet_address!,
          // The network comes from the recipient row, where the user actually
          // chose it, rather than a literal buried in this file. BSC remains
          // the only value this account accepts, but the source of truth lives
          // with the address it describes.
          network: recipient.network ?? "BSC",
        }
      : { type: channel.payOutType, recipientId },
  });

  return busha.createTransfer(quote.id);
}
