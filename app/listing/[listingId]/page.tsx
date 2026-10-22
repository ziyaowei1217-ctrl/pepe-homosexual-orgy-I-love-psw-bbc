import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ListingDetailExperience } from "@/components/marketplace/listing-detail-experience";
import { PublicShell } from "@/components/marketplace/public-shell";
import { loadMarketplaceListing } from "@/lib/marketplace-data";
import { ProductApiError } from "@/lib/product-errors";

// One request per render: the title and the page share the loaded listing.
const loadListing = cache((listingId: string) => loadMarketplaceListing(listingId));

export async function generateMetadata({ params }: { params: Promise<{ listingId: string }> }): Promise<Metadata> {
  const { listingId } = await params;
  try {
    // Tabs and shared links name the room, not a generic "listing details".
    const listing = await loadListing(listingId);
    return { title: listing.title, description: `${listing.area}的转租房间，月租 $${listing.price.toLocaleString("en-US")}。选好日期就能看到这段日期的总价。` };
  } catch (error) {
    if (error instanceof ProductApiError && error.status === 404) notFound();
    return { title: "房源详情" };
  }
}

export default async function ListingPage({ params, searchParams }: { params: Promise<{ listingId: string }>; searchParams?: Promise<{ moveIn?: string; moveOut?: string }> }) {
  const { listingId } = await params;
  const stay = await searchParams;
  let listing;
  try {
    listing = await loadListing(listingId);
  } catch (error) {
    if (error instanceof ProductApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <PublicShell active="discover" mobileNavigation="header">
      <ListingDetailExperience key={`${listing.id}:${stay?.moveIn ?? ""}:${stay?.moveOut ?? ""}`} listing={listing} initialStay={stay} />
    </PublicShell>
  );
}
