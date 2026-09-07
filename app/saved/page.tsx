import type { Metadata } from "next";

import { PublicShell } from "@/components/marketplace/public-shell";
import { SavedPageExperience } from "@/components/marketplace/saved-page-experience";
import { loadMarketplaceListings } from "@/lib/marketplace-data";

export const metadata: Metadata = {
  title: "收藏清单"
};

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const listings = await loadMarketplaceListings();
  return (
    <PublicShell active="saved">
      <SavedPageExperience listings={listings} />
    </PublicShell>
  );
}
