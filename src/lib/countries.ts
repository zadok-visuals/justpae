import { CURRENCIES } from "@/lib/currencies";

/**
 * ISO 3166-1 alpha-2 list for the signup country selector. A user's country is
 * stored as-is whichever one they pick — only the codes in
 * LOCAL_WALLET_COUNTRIES get a local-currency wallet auto-provisioned (see
 * handle_new_user in the initial migration). Everyone gets USD and USDT
 * regardless of country.
 *
 * The three supported countries are listed first so they're reachable without
 * scrolling; the rest follow alphabetically.
 */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AO", name: "Angola" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BJ", name: "Benin" },
  { code: "BO", name: "Bolivia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brazil" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "CV", name: "Cabo Verde" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo (DRC)" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "GT", name: "Guatemala" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "MX", name: "Mexico" },
  { code: "MD", name: "Moldova" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "MK", name: "North Macedonia" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PA", name: "Panama" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "RW", name: "Rwanda" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TG", name: "Togo" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
];

const COUNTRY_NAMES = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export function countryName(code: string | null | undefined): string | null {
  return code ? (COUNTRY_NAMES.get(code) ?? code) : null;
}

/**
 * Derived from the currency config rather than duplicated — a currency with a
 * `country` is by definition one we provision a local wallet for, so adding a
 * currency entry is the only change needed to support a new country.
 */
export const LOCAL_WALLET_COUNTRIES = new Set(
  CURRENCIES.map((c) => c.country).filter((c): c is string => !!c),
);

/** Countries bills/airtime can be paid in — the same three supported markets. */
export const BILL_COUNTRIES = COUNTRIES.filter((c) => LOCAL_WALLET_COUNTRIES.has(c.code));

/**
 * Signup accepts any country in the list above, not only the three with a
 * local wallet. A user in a fourth country still gets USD and USDT wallets and
 * a real, accurately recorded country — recording "NG" for someone in Kenya's
 * neighbour because the list was shorter is worse than having no local wallet.
 */
export function isKnownCountry(code: string): boolean {
  return COUNTRY_NAMES.has(code);
}

/**
 * The identity document each supported country actually uses. Asking a
 * Ghanaian for a BVN, or a Kenyan for a NIN, is the kind of detail that makes
 * an onboarding form feel like it was built for somewhere else.
 *
 * `pattern` is a light format check only — none of these are verified against
 * an issuing authority here. The stored value is the raw input for a human
 * reviewer, which is exactly what kyc_documents.value is for.
 *
 * It is held as a STRING, not a RegExp, and that is load-bearing. The whole
 * KycIdField is handed from a Server Component to the client KYC form, and a
 * RegExp is not serializable across that boundary — React throws "Only plain
 * objects ... can be passed to Client Components" and the verification screen
 * 500s before it renders. Strings cross it fine; kycIdPattern() rebuilds the
 * RegExp on the server side, where the check actually runs.
 */
export interface KycIdField {
  /** kyc_documents.document_type for this input. */
  documentType: string;
  label: string;
  hint: string;
  /** Anchored regex SOURCE, where the format is fixed. Never a RegExp. */
  pattern?: string;
  /** Flags for the above, e.g. "i" for a case-insensitive card number. */
  patternFlags?: string;
}

export const KYC_ID_FIELDS: Record<string, KycIdField> = {
  NG: {
    documentType: "nigeria_bvn_or_nin",
    label: "BVN or NIN",
    hint: "11 digits. Dial *565*0# for your BVN.",
    pattern: "^\\d{11}$",
  },
  GH: {
    documentType: "ghana_card_number",
    label: "Ghana Card number",
    hint: "Format GHA-XXXXXXXXX-X, as printed on the card.",
    pattern: "^GHA-\\d{9}-\\d$",
    patternFlags: "i",
  },
  KE: {
    documentType: "kenya_national_id",
    label: "National ID number",
    hint: "The 7 or 8 digit number on your Huduma or national ID card.",
    pattern: "^\\d{7,8}$",
  },
};

/** The compiled form of KycIdField.pattern, or null when there is no check. */
export function kycIdPattern(field: KycIdField): RegExp | null {
  if (!field.pattern) return null;
  return new RegExp(field.pattern, field.patternFlags);
}

/**
 * Falls back to a generic field rather than refusing to onboard someone from a
 * country without a specific entry — a reviewer can still work with a passport
 * number plus the uploaded documents.
 */
export function kycIdFieldFor(country: string | null | undefined): KycIdField {
  if (country && KYC_ID_FIELDS[country]) return KYC_ID_FIELDS[country];
  return {
    documentType: "government_id_number",
    label: "Government ID number",
    hint: "Passport or national ID number, exactly as printed.",
  };
}
