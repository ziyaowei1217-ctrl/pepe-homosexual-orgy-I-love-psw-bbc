/**
 * psw trust: only what the platform actually knows about a listing.
 * - reviewed: the platform reviewed the listing's details (public catalog rows are reviewed).
 * - landlordAware: the person subletting (转租人) declared that the landlord knows and agrees. It is a declaration;
 *   there is no lease or consent-letter check yet, so the copy never says the lease was verified.
 */
export type ListingTrust = { reviewed: boolean; landlordAware: boolean };

export function listingTrust(trust: string | undefined): ListingTrust {
  const value = trust ?? "";
  return { reviewed: value.includes("平台已审核"), landlordAware: value.includes("房东知情") };
}

export function reviewLabel(trust: ListingTrust) {
  return trust.reviewed ? "平台已审核" : "待平台审核";
}
