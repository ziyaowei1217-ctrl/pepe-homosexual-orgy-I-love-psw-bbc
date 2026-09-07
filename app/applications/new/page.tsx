import type { Metadata } from "next";

import { ApplicationFormExperience } from "@/components/marketplace/application-experiences";
import { PublicShell } from "@/components/marketplace/public-shell";
import { loadMarketplaceListing, loadMarketplaceListings } from "@/lib/marketplace-data";

export const metadata: Metadata = { title: "申请租住" };

export default async function NewApplicationPage({ searchParams }: { searchParams?: Promise<{ listingId?: string; moveIn?: string; moveOut?: string; selection?: string }> }) {
  const params = await searchParams;
  const selectionId = params?.selection && /^[a-zA-Z0-9-]{1,80}$/.test(params.selection) ? params.selection : undefined;
  const listing = params?.listingId
    ? await loadMarketplaceListing(params.listingId)
    : (await loadMarketplaceListings())[0];
  if (!listing) return <PublicShell active="account"><EmptyApplicationState /></PublicShell>;
  return <PublicShell active="account" mobileNavigation="header"><ApplicationFormExperience key={`${listing.id}:${params?.moveIn ?? ""}:${params?.moveOut ?? ""}:${selectionId ?? ""}`} listing={listing} initialStay={params} selectionId={selectionId} /></PublicShell>;
}

function EmptyApplicationState() {
  return <main className="grid min-h-[60dvh] place-items-center px-6 text-center"><div><h1 className="text-3xl font-black">暂无可申请房源</h1><p className="mt-3 text-sm text-slate-500">房源发布后会出现在这里。</p></div></main>;
}
