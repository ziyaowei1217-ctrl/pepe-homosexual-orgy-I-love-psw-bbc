import type { Metadata } from "next";
import Link from "next/link";

import { DeadEnd, primaryButton } from "@/components/marketplace/dead-end";
import { ListingCard } from "@/components/marketplace/listing-card";
import { PublicShell } from "@/components/marketplace/public-shell";
import { loadMarketplaceListings } from "@/lib/marketplace-data";
import { earliestListingDate } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";

export const metadata: Metadata = { title: "这个房间已经下架" };

/** Sublets come down as soon as they are taken, so old shared links end here often: show what can still be rented. */
async function stillAvailable(): Promise<PreviewListing[]> {
  try {
    const listings = await loadMarketplaceListings();
    return listings.filter((listing) => earliestListingDate(listing) < listing.availableTo.slice(0, 10)).slice(0, 4);
  } catch {
    return [];
  }
}

export default async function ListingNotFound() {
  const listings = await stillAvailable();
  return (
    <PublicShell active="discover" mobileNavigation="header">
      <DeadEnd
        title="这个房间已经下架了"
        body="转租的房间租出去或过了可租日期就会下架，也可能是链接写错了。"
        action={<Link href="/search" className={primaryButton}>看现在能租的房</Link>}
      >
        {listings.length ? <section aria-labelledby="still-available" className="mt-12">
          <h2 id="still-available" className="font-rounded text-m-title text-ink sm:text-d-title">现在还能租</h2>
          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
            {listings.map((listing) => <ListingCard key={listing.id} listing={listing} href={`/listing/${encodeURIComponent(listing.id)}`} />)}
          </div>
        </section> : null}
      </DeadEnd>
    </PublicShell>
  );
}
