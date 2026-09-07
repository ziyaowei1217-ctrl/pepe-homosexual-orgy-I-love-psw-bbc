import type { Metadata } from "next";

import { HostListingsExperience } from "@/components/marketplace/host-experiences";
import { HostShell } from "@/components/marketplace/workspace-shells";

export const metadata: Metadata = { title: "我的房源" };

export default function HostListingsPage() {
  return <HostShell active="listings"><HostListingsExperience /></HostShell>;
}
