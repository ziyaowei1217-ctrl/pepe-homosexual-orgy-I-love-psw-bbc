import type { Metadata } from "next";

import { PublicShell } from "@/components/marketplace/public-shell";
import { SearchExperience } from "@/components/marketplace/search-experience";
import { loadMarketplaceListings } from "@/lib/marketplace-data";
import { parseSearchState, searchHref } from "@/lib/search-state";

export const metadata: Metadata = {
  title: "搜索房源"
};

export default async function SearchPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialState = parseSearchState(new URLSearchParams(Object.entries(params ?? {}).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : [])));
  const listings = await loadMarketplaceListings();

  return (
    <PublicShell active="discover">
      <SearchExperience
        key={searchHref(initialState)}
        listings={listings}
        initialQuery={initialState.query}
        initialMoveIn={initialState.moveIn}
        initialMoveOut={initialState.moveOut}
        initialState={initialState}
      />
    </PublicShell>
  );
}
