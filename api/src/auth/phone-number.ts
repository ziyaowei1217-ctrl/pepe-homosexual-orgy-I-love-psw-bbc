// Phone numbers are accepted only for regions the deployment explicitly enables.
// A short allowlist keeps SMS cost and toll-fraud exposure bounded: premium-rate
// destinations are outside these plans, and NANP numbers outside the US and
// Canada (Caribbean and Atlantic territories) are refused.
export type PhoneRegion = "US_CA" | "CN";

export const PHONE_REGIONS: readonly PhoneRegion[] = ["US_CA", "CN"];

// NANP area codes that belong to countries other than the US and Canada.
const NON_US_CA_NANP_AREA_CODES = new Set([
  "242", "246", "264", "268", "284", "345", "441", "473", "649", "658", "664",
  "721", "758", "767", "784", "809", "829", "849", "868", "869", "876"
]);

export function parsePhoneRegions(raw: string | undefined): PhoneRegion[] {
  const value = (raw ?? "US_CA").trim();
  if (!value) throw new Error("PHONE_AUTH_REGIONS must list at least one region");
  const regions = value.split(",").map((entry) => entry.trim());
  if (regions.some((entry) => !PHONE_REGIONS.includes(entry as PhoneRegion)) || new Set(regions).size !== regions.length) {
    throw new Error(`PHONE_AUTH_REGIONS must be a comma-separated subset of ${PHONE_REGIONS.join(",")}`);
  }
  return regions as PhoneRegion[];
}

// Returns the E.164 form, or null when the input is malformed or outside the
// enabled regions. Common punctuation is tolerated; letters never are.
export function normalizePhoneNumber(input: unknown, regions: readonly PhoneRegion[]): string | null {
  if (typeof input !== "string" || input.length > 32) return null;
  const trimmed = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/[\s().-]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (regions.includes("US_CA") && /^\d{10}$/.test(digits)) digits = `1${digits}`;
  else if (regions.includes("CN") && /^1[3-9]\d{9}$/.test(digits)) digits = `86${digits}`;
  else return null;
  if (!/^\d+$/.test(digits)) return null;

  if (regions.includes("US_CA") && /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
    const areaCode = digits.slice(1, 4);
    // N11 codes (211, 911, ...) are service codes, not subscriber numbers.
    if (NON_US_CA_NANP_AREA_CODES.has(areaCode) || areaCode.slice(1) === "11") return null;
    return `+${digits}`;
  }
  if (regions.includes("CN") && /^861[3-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

// Shows only enough to recognise one's own number.
export function maskPhoneNumber(phoneNumber: string) {
  const lastFour = phoneNumber.slice(-4);
  if (phoneNumber.startsWith("+1")) return `+1 ••• ••• ${lastFour}`;
  if (phoneNumber.startsWith("+86")) return `+86 ••• •••• ${lastFour}`;
  return `••• ${lastFour}`;
}
