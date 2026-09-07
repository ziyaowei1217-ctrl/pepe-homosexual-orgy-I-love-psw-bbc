import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListingDetailExperience } from "@/components/marketplace/listing-detail-experience";
import { PublicShell } from "@/components/marketplace/public-shell";
import { loadMarketplaceListing } from "@/lib/marketplace-data";
import { ProductApiError } from "@/lib/product-errors";

export async function generateMetadata({ params }: { params: Promise<{ listingId: string }> }): Promise<Metadata> {
  await params;
  return { title: "房源详情" };
}

export default async function ListingPage({ params, searchParams }: { params: Promise<{ listingId: string }>; searchParams?: Promise<{ moveIn?: string; moveOut?: string }> }) {
  const { listingId } = await params;
  const stay = await searchParams;
  let listing;
  try {
    listing = await loadMarketplaceListing(listingId);
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
