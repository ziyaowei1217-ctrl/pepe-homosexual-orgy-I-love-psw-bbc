import type { Metadata } from "next";

import { HostListingEditorExperience } from "@/components/marketplace/host-experiences";
import { HostShell } from "@/components/marketplace/workspace-shells";

export const metadata: Metadata = { title: "发布房源" };

export default function NewHostListingPage() {
  return <HostShell active="listings"><HostListingEditorExperience /></HostShell>;
}
