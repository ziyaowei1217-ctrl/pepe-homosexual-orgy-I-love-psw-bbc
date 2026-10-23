import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ApplicationFormExperience } from "@/components/marketplace/application-experiences";
import { PublicShell } from "@/components/marketplace/public-shell";
import { listingHref, listingStayError } from "@/lib/listing-stay";
import { loadMarketplaceListing, loadMarketplaceListings } from "@/lib/marketplace-data";
import { ProductApiError } from "@/lib/product-errors";

export const metadata: Metadata = { title: "申请租住" };

export default async function NewApplicationPage({ searchParams }: { searchParams?: Promise<{ listingId?: string; moveIn?: string; moveOut?: string; selection?: string }> }) {
  const params = await searchParams;
  const selectionId = params?.selection && /^[a-zA-Z0-9-]{1,80}$/.test(params.selection) ? params.selection : undefined;
  let listing;
  try {
    listing = params?.listingId
      ? await loadMarketplaceListing(params.listingId)
      : (await loadMarketplaceListings())[0];
  } catch (error) {
    if (error instanceof ProductApiError && error.status === 404) notFound();
    throw error;
  }
  if (!listing) return <PublicShell active="account"><EmptyApplicationState /></PublicShell>;
  // Dates the listing cannot be rented for go back to the listing, which says why and lets the renter pick again.
  const requested = { moveIn: params?.moveIn ?? "", moveOut: params?.moveOut ?? "" };
  if ((requested.moveIn || requested.moveOut) && listingStayError(requested, listing)) redirect(listingHref(listing.id, requested));
  return <PublicShell active="account" mobileNavigation="header"><ApplicationFormExperience key={`${listing.id}:${params?.moveIn ?? ""}:${params?.moveOut ?? ""}:${selectionId ?? ""}`} listing={listing} initialStay={params} selectionId={selectionId} /></PublicShell>;
}

function EmptyApplicationState() {
  return <main className="grid min-h-[60dvh] place-items-center px-6 text-center"><div><h1 className="font-rounded text-m-title text-ink sm:text-d-title">暂无可申请房源</h1><p className="mt-3 text-d-subhead text-ink-secondary">房源发布后会出现在这里。</p></div></main>;
}
