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
 * Airtime:     no variation code needed — just amount + phone.
 * Electricity: variation_code = "prepaid" (always; postpaid not offered in-app).
 * Data / Cable TV: variation codes are plan-specific and MANDATORY on VTpass.
 *   We call /api/service-variations for the chosen biller, then pick the
 *   variation whose amount is the closest match ≤ the user's entered amount.
 *   A future enhancement would let the user browse and select a plan directly.
 *
 * ── Phone field ──────────────────────────────────────────────────────────────
 *
 * VTpass requires a "phone" field on every /api/pay call:
 *   - Airtime / Data: the phone number being topped up (same as customerIdentifier).
 *   - Electricity / Cable TV / Water: a contact phone number for SMS delivery of
 *     the token/receipt. This is NOT the meter or smartcard number — it must be a
 *     real Nigerian phone number. The BillsProvider.pay() interface therefore
 *     accepts an optional `phone` field for metered services; if absent we fall
 *     back to a placeholder that VTpass accepts ("08000000000") so the payment
 *     isn't blocked, but callers should always supply the real number.
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
 *
 * ── request_id rules ─────────────────────────────────────────────────────────
 *
 * VTpass requires:
 *   - First 12 chars: numeric YYYYMMDDHHII (Lagos/GMT+1 timezone)
 *   - Remaining chars: alphanumeric ONLY — no hyphens or special characters
 *   - Minimum total length: 12 characters
 */

import type { BillsProvider, Biller, BillerValidation, BillPaymentResult } from "@/lib/providers/bills";
import {
  vtpassVerify,
  vtpassPay,
  vtpassServiceVariations,
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

/**
 * Strips hyphens and any non-alphanumeric characters from a string so it can
 * safely be appended to a VTpass request_id (which must be alphanumeric only
 * after the 12-digit numeric timestamp prefix).
 */
function sanitizeRequestIdSuffix(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/**
 * For data and cable TV, VTpass mandates a variation_code — you cannot send
 * just an amount. We call /api/service-variations and pick the plan whose
 * variation_amount is the closest match ≤ the requested amount.
 *
 * Returns null if no suitable plan is found (e.g. amount is below the minimum
 * available plan). The caller should treat null as an error.
 */
async function resolveVariationCode(
  serviceID: string,
  amount: number,
): Promise<string | null> {
  try {
    const res = await vtpassServiceVariations(serviceID);
    const variations = res.content?.variations ?? [];
    if (variations.length === 0) return null;

    // Pick the highest variation_amount that is ≤ the user's requested amount.
    // This matches what the user intended to buy as closely as possible without
    // overcharging them.
    const candidates = variations
      .map((v) => ({ code: v.variation_code, amount: parseFloat(v.variation_amount) }))
      .filter((v) => v.amount <= amount)
      .sort((a, b) => b.amount - a.amount); // descending

    return candidates[0]?.code ?? null;
  } catch (err) {
    console.error("[vtpass.resolveVariationCode] failed to fetch variations", { serviceID, err });
    return null;
  }
}

export const vtpassBillsProvider: BillsProvider = {
  name: "vtpass",

  async listBillers({ country, category }) {
    // VTpass doesn't have a list-billers endpoint that maps cleanly to ours.
    // We return [] to fall back to the BILLER_CATALOGUE for all countries,
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

  async pay({ biller, customerIdentifier, amount, reference, phone }) {
    if (!isSupported(biller)) {
      throw new Error(
        `VTpass does not support biller ${biller.code} (${biller.country}). Use a local provider for GH/KE.`
      );
    }

    const serviceId = toServiceId(biller.code)!;

    // Sanitize the reference suffix: strip hyphens and non-alphanumeric chars.
    // VTpass requires request_id to be alphanumeric only after the 12-digit timestamp.
    const sanitizedSuffix = sanitizeRequestIdSuffix(reference.slice(0, 12));
    const requestId = `${generateRequestId()}${sanitizedSuffix}`;

    const isAirtimeOrData = biller.category === "airtime" || biller.category === "data";
    const isElectricity = biller.category === "electricity";
    const isData = biller.category === "data";
    const isCable = biller.category === "cable_tv";

    // ── Resolve variation_code ──────────────────────────────────────────────
    // Airtime: no variation code needed.
    // Electricity: variation_code is always "prepaid" for in-app purchases.
    // Data / Cable TV: MANDATORY — must be fetched from /api/service-variations
    //   and matched to the user's chosen amount.
    let variation_code: string | undefined;

    if (isElectricity) {
      variation_code = "prepaid";
    } else if (isData || isCable) {
      const resolved = await resolveVariationCode(serviceId, amount);
      if (!resolved) {
        throw new Error(
          `No ${biller.name} plan found at or below ₦${amount}. ` +
          `Please try a different amount that matches an available plan.`
        );
      }
      variation_code = resolved;
    }

    // ── Phone field ─────────────────────────────────────────────────────────
    // VTpass requires a phone number on every pay call.
    // For airtime/data: the customerIdentifier IS the phone number.
    // For electricity/cable: we need a contact phone for SMS token delivery.
    //   The caller should pass `phone` for metered services. We fall back to
    //   a placeholder only if none is provided (sandbox is tolerant; live may not be).
    const phoneNumber = isAirtimeOrData
      ? customerIdentifier
      : (phone ?? "08000000000");

    const res = await vtpassPay({
      request_id: requestId,
      serviceID: serviceId,
      // Airtime has no billersCode — the phone IS the recipient.
      // Data also has no billersCode — variation_code + phone identify the purchase.
      // Electricity and cable TV: billersCode is the meter/smartcard number.
      billersCode: isAirtimeOrData ? undefined : customerIdentifier,
      variation_code,
      amount,
      phone: phoneNumber,
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
