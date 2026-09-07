import { redirect } from "next/navigation";

import { HomeExperience } from "@/components/marketplace/home-experience";
import { PublicShell } from "@/components/marketplace/public-shell";
import { loadMarketplaceListings } from "@/lib/marketplace-data";

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ groupTour?: string; dealRoomId?: string; listingId?: string }>;
}) {
  const params = await searchParams;
  if (params?.listingId) {
    redirect(`/listing/${encodeURIComponent(params.listingId)}`);
  }
  if (params?.groupTour === "1") {
    const query = params.dealRoomId
      ? `?groupTour=1&dealRoomId=${encodeURIComponent(params.dealRoomId)}`
      : "?groupTour=1";
    redirect(`/search${query}`);
  }

  const listings = await loadMarketplaceListings();

  return (
    <PublicShell active="discover">
      <HomeExperience listings={listings.slice(0, 4)} />
    </PublicShell>
  );
}
