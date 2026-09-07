import type { Metadata } from "next";

import { HostListingEditorExperience } from "@/components/marketplace/host-experiences";
import { HostShell } from "@/components/marketplace/workspace-shells";

export const metadata: Metadata = { title: "管理房源" };

export default async function EditHostListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <HostShell active="listings"><HostListingEditorExperience listingId={listingId} /></HostShell>;
}
