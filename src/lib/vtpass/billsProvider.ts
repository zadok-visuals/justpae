/**
 * VTpass implementation of the BillsProvider interface.
 *
 * src/lib/vtpass/billsProvider.ts
 *
 * ── What this maps ───────────────────────────────────────────────────────────
 *
 * VTpass serviceIDs for Nigeria:
 *
 *   Airtime:     mtn | airtel | glo | etisalat   (9mobile uses "etisalat")
 *   Data:        mtn-data | airtel-data | glo-data | etisalat-data
 *   Electricity: ikeja-electric (IKEDC) | eko-electric (EKEDC) |
 *                abuja-electric (AEDC) | phed | ibedc | kedco |
 *                enugu-electric | benin-electric | jos-electric | kaduna-electric
 *   Cable TV:    dstv | gotv | startimes | showmax
 *   Water:       (no VTpass water endpoint — handled gracefully)
 *
 * The BILLER_CATALOGUE in providers/bills.ts uses our own internal codes. The
 * map below translates them to VTpass serviceIDs.
 *
 * ── Variation codes ──────────────────────────────────────────────────────────
 *
 * Airtime: no variation code needed.
 * Electricity: variation_code = "prepaid" or "postpaid". We always use prepaid
 *   for purchases from the app; the user can buy postpaid by switching to the
 *   postpaid variant (future: add a toggle). For now, always "prepaid".
 * Data / Cable TV: variation codes are plan-specific (e.g. "mtn-1gb-1000").
 *   Those require a separate /api/service-variations endpoint. For the current
 *   integration, data and cable are routed to VTpass with the amount the user
 *   entered, which works for many plans. A future enhancement would fetch
 *   variations per biller and present them as selectable plans.
 *
 * ── Customer name lookup ─────────────────────────────────────────────────────
 *
 * VTpass /api/merchant-verify works for electricity (meter → customer name)
 * and cable TV (smartcard → account name). Airtime and data don't support it.
 *
 * ── Error codes ──────────────────────────────────────────────────────────────
 *
 * VTpass returns `code: "000"` for success and various strings for failure:
 *   "099" — transaction is processing (use requery)
 *   "016" — failed
 *   others — see their docs
 */

import type { BillsProvider, Biller, BillerValidation, BillPaymentResult } from "@/lib/providers/bills";
import {
  vtpassVerify,
  vtpassPay,
  generateRequestId,
  isVTpassConfigured,
} from "@/lib/vtpass/client";

/** Maps our internal biller codes to VTpass serviceIDs. */
const SERVICE_ID_MAP: Record<string, string> = {
  // Nigeria — Airtime
  MTN_AIRTIME: "mtn",
  AIRTEL_AIRTIME: "airtel",
  GLO_AIRTIME: "glo",
  "9MOBILE_AIRTIME": "etisalat",

  // Nigeria — Data
  MTN_DATA: "mtn-data",
  AIRTEL_DATA: "airtel-data",
  GLO_DATA: "glo-data",
  "9MOBILE_DATA": "etisalat-data",

  // Nigeria — Electricity
  IKEDC: "ikeja-electric",
  EKEDC: "eko-electric",
  AEDC: "abuja-electric",
  PHED: "phed",
  IBEDC: "ibedc",
  KEDCO: "kedco",
  EEDC: "enugu-electric",
  BEDC: "benin-electric",
  JED: "jos-electric",
  KAEDCO: "kaduna-electric",

  // Nigeria — Cable TV
  DSTV: "dstv",
  GOTV: "gotv",
  STARTIMES: "startimes",
  SHOWMAX: "showmax",
};

function toServiceId(billerCode: string): string | null {
  return SERVICE_ID_MAP[billerCode] ?? null;
}

/** VTpass doesn't support GH/KE billers yet — only route NG billers. */
function isSupported(biller: Biller): boolean {
  return biller.country === "NG" && toServiceId(biller.code) !== null;
}

export const vtpassBillsProvider: BillsProvider = {
  name: "vtpass",

  async listBillers({ country, category }) {
    // VTpass doesn't have a list-billers endpoint that maps cleanly to ours.
    // We return null to fall back to the BILLER_CATALOGUE for all countries,
    // since our catalogue already has the real NG names.
    void country;
    void category;
    return [];
  },

  async validateCustomer({ biller, customerIdentifier }) {
    if (!isSupported(biller)) {
      // Graceful degradation: not a VTpass biller (GH/KE), mark as unsupported.
      return { customerName: null };
    }

    const serviceId = toServiceId(biller.code)!;
    const isElectricity = biller.category === "electricity";
    const isCable = biller.category === "cable_tv";

    if (!isElectricity && !isCable) {
      // Airtime and data don't support name lookups on VTpass.
      return { customerName: null };
    }

    try {
      const res = await vtpassVerify({
        serviceID: serviceId,
        billersCode: customerIdentifier,
        type: isElectricity ? "prepaid" : undefined,
      });

      if (res.code !== "000" || !res.content) {
        return { customerName: null, error: res.response_description || "Couldn't verify that number." };
      }

      if (res.content.error) {
        return { customerName: null, error: res.content.error };
      }

      return {
        customerName: res.content.Customer_Name ?? null,
        outstandingAmount: res.content.Outstanding_Balance
          ? parseFloat(res.content.Outstanding_Balance)
          : null,
      } satisfies BillerValidation;
    } catch (err) {
      console.error("[vtpass.validateCustomer] error", err);
      // Treat a lookup failure as unsupported — it doesn't block the payment.
      return { customerName: null };
    }
  },

  async pay({ biller, customerIdentifier, amount, reference }) {
    if (!isSupported(biller)) {
      throw new Error(
        `VTpass does not support biller ${biller.code} (${biller.country}). Use a local provider for GH/KE.`
      );
    }

    const serviceId = toServiceId(biller.code)!;

    // Use our DB row id as a suffix to the request_id so it is traceable,
    // while still matching VTpass's timestamp-prefix convention.
    const requestId = `${generateRequestId()}${reference.slice(0, 8).toUpperCase()}`;

    const isElectricity = biller.category === "electricity";

    const res = await vtpassPay({
      request_id: requestId,
      serviceID: serviceId,
      billersCode: ["airtime", "data"].includes(biller.category) ? undefined : customerIdentifier,
      variation_code: isElectricity ? "prepaid" : undefined,
      amount,
      // VTpass requires a Nigerian phone number for notifications. We use the
      // customer identifier for airtime/data (it IS the phone), and a fallback
      // placeholder for metered services since VTpass still requires the field.
      phone:
        biller.category === "airtime" || biller.category === "data"
          ? customerIdentifier
          : customerIdentifier, // same field, but for electricity it's the meter
    });

    // "000" = success; "099" = processing (async); anything else = failure.
    if (res.code !== "000" && res.code !== "099") {
      throw new Error(
        res.content?.error ||
          res.response_description ||
          `VTpass payment failed (code ${res.code})`
      );
    }

    return {
      providerReference: res.requestId ?? requestId,
      token: res.purchased_code ?? null,
      units: null,
      pending: res.code === "099",
    } satisfies BillPaymentResult;
  },
};

export function isVTpassReady(): boolean {
  return isVTpassConfigured();
}
