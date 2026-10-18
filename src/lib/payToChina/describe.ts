import type { PayToChinaRecipient, PayoutMethod } from "@/lib/types/database";

/**
 * Turning a recipient row into something a human reads.
 *
 * Two shapes, for two audiences, from one source:
 *
 *   describePayToChinaRecipient  one line, for the customer's own receipt.
 *   payoutDetailFields           labelled fields, for the admin who has to
 *                                COPY each one into a Chinese payment app.
 *
 * The admin shape is the reason this is structured rather than a string. A
 * person paying an Alipay account types the handle into another application;
 * giving them one concatenated line means selecting part of it by hand, on a
 * phone, with somebody's money at stake. Each field gets its own copy button
 * because each field is copied separately.
 */

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  alipay: "Alipay",
  wechat: "WeChat Pay",
  bank: "Chinese bank",
};

type RecipientLike = Pick<
  PayToChinaRecipient,
  | "payout_method"
  | "recipient_first_name"
  | "recipient_last_name"
  | "recipient_alipay_id"
  | "recipient_wechat_id"
  | "recipient_bank_account_number"
  | "recipient_bank_name"
  | "recipient_account_holder_name"
  | "qr_code_ref"
>;

/** One line for the customer's receipt. */
export function describePayToChinaRecipient(recipient: RecipientLike): string {
  const method = PAYOUT_METHOD_LABELS[recipient.payout_method];

  if (recipient.payout_method === "bank") {
    return [method, recipient.recipient_bank_name, recipient.recipient_account_holder_name]
      .filter(Boolean)
      .join(" · ");
  }

  const name = [recipient.recipient_first_name, recipient.recipient_last_name]
    .filter(Boolean)
    .join(" ");
  const handle =
    recipient.payout_method === "alipay"
      ? recipient.recipient_alipay_id
      : recipient.recipient_wechat_id;

  // A QR-only recipient is the common case, not an edge one — most people
  // are sent a screenshot and never learn the account's handle. It says so
  // rather than rendering a line with a hole in it.
  return [method, name || null, handle || "by QR code"].filter(Boolean).join(" · ");
}

export interface PayoutField {
  label: string;
  value: string;
  /** Rendered monospaced and with a copy button — a number to be transcribed. */
  copyable?: boolean;
}

/** Labelled fields, for the admin who has to transcribe each one. */
export function payoutDetailFields(recipient: RecipientLike): PayoutField[] {
  const fields: PayoutField[] = [
    { label: "Method", value: PAYOUT_METHOD_LABELS[recipient.payout_method] },
  ];

  if (recipient.payout_method === "bank") {
    if (recipient.recipient_bank_name) {
      fields.push({ label: "Bank", value: recipient.recipient_bank_name, copyable: true });
    }
    if (recipient.recipient_bank_account_number) {
      fields.push({
        label: "Account number",
        value: recipient.recipient_bank_account_number,
        copyable: true,
      });
    }
    if (recipient.recipient_account_holder_name) {
      fields.push({
        label: "Account name",
        value: recipient.recipient_account_holder_name,
        copyable: true,
      });
    }
    return fields;
  }

  const name = [recipient.recipient_first_name, recipient.recipient_last_name]
    .filter(Boolean)
    .join(" ");
  if (name) fields.push({ label: "Name", value: name, copyable: true });

  const handle =
    recipient.payout_method === "alipay"
      ? recipient.recipient_alipay_id
      : recipient.recipient_wechat_id;
  if (handle) {
    fields.push({
      label: recipient.payout_method === "alipay" ? "Alipay ID" : "WeChat ID",
      value: handle,
      copyable: true,
    });
  } else if (recipient.qr_code_ref) {
    // Stated explicitly rather than left as an absence. An admin who sees no
    // handle needs to know whether to scan the QR or chase the customer.
    fields.push({ label: "Pay by", value: "QR code only — scan the image below" });
  }

  return fields;
}
