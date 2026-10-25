// Relative, extension-bearing imports — covered by serviceCatalogue.test.ts,
// which runs under `node --test` with no path-alias resolver.
import { isServiceLive } from "../services.ts";

/**
 * Every service the product offers, in one list, read three ways: the seven
 * circles on Home, the full /services page grouped by category, and the
 * "Soon" tag on the ones that are not live yet.
 *
 * One list rather than three, because the previous arrangement — a hand-built
 * tile row on Home and a separate /bills index — is how a service ends up
 * live in one place and missing from the other.
 */

export type ServiceTone = "blue" | "green" | "sky" | "violet" | "coral" | "teal";

export type ServiceCategory = "Bills and utilities" | "Money" | "Travel";

export interface ServiceEntry {
  key: string;
  label: string;
  href: string;
  tone: ServiceTone;
  category: ServiceCategory;
  /** False while the service is under maintenance: a "Soon" tag, not a page. */
  live: boolean;
}

/** The soft ground and the solid icon, per tone. */
export const TONE_CLASS: Record<ServiceTone, string> = {
  blue: "bg-icon-blue-soft text-icon-blue",
  green: "bg-icon-green-soft text-icon-green",
  sky: "bg-icon-sky-soft text-icon-sky",
  violet: "bg-icon-violet-soft text-icon-violet",
  coral: "bg-icon-coral-soft text-icon-coral",
  teal: "bg-icon-teal-soft text-icon-teal",
};

export function serviceCatalogue(): ServiceEntry[] {
  const bills = isServiceLive("bills");
  return [
    { key: "airtime", label: "Airtime", href: "/bills/airtime", tone: "blue", category: "Bills and utilities", live: bills },
    { key: "data", label: "Data", href: "/bills/data", tone: "violet", category: "Bills and utilities", live: bills },
    { key: "electricity", label: "Electricity", href: "/bills/electricity", tone: "sky", category: "Bills and utilities", live: bills },
    { key: "cable_tv", label: "Cable TV", href: "/bills/cable_tv", tone: "coral", category: "Bills and utilities", live: bills },
    { key: "water", label: "Water", href: "/bills/water", tone: "teal", category: "Bills and utilities", live: bills },
    { key: "education", label: "Education", href: "/bills/education", tone: "green", category: "Bills and utilities", live: bills },

    { key: "deposit", label: "Deposit", href: "/deposit", tone: "green", category: "Money", live: true },
    { key: "withdraw", label: "Withdraw", href: "/withdraw", tone: "blue", category: "Money", live: true },
    { key: "convert", label: "Convert", href: "/convert", tone: "violet", category: "Money", live: true },
    { key: "pay_to_china", label: "Pay to China", href: "/pay-to-china", tone: "coral", category: "Money", live: true },
    { key: "receive", label: "Receive USD", href: "/receive", tone: "teal", category: "Money", live: isServiceLive("receiveUsd") },

    { key: "flights", label: "Flights", href: "/flights", tone: "sky", category: "Travel", live: isServiceLive("flights") },
  ];
}

/**
 * The six on Home's "Quick services" card, in the order the brief names them.
 * There is no seventh "More" circle: the card header's "See all" already goes
 * to /services, and two controls to the same page is one too many.
 */
const HOME_KEYS = ["flights", "airtime", "data", "electricity", "cable_tv", "education"];

export function homeQuickServices(): ServiceEntry[] {
  const byKey = new Map(serviceCatalogue().map((s) => [s.key, s]));
  return HOME_KEYS.map((key) => byKey.get(key)).filter((s): s is ServiceEntry => s != null);
}

const CATEGORY_ORDER: ServiceCategory[] = ["Bills and utilities", "Money", "Travel"];

export function servicesByCategory(): { category: ServiceCategory; services: ServiceEntry[] }[] {
  const all = serviceCatalogue();
  return CATEGORY_ORDER.map((category) => ({
    category,
    services: all.filter((s) => s.category === category),
  })).filter((group) => group.services.length > 0);
}
