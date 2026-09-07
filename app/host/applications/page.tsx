import type { Metadata } from "next";

import { HostApplicationsExperience } from "@/components/marketplace/host-experiences";
import { HostShell } from "@/components/marketplace/workspace-shells";

export const metadata: Metadata = { title: "申请审核" };

export default function HostApplicationsPage() {
  return <HostShell active="applications"><HostApplicationsExperience /></HostShell>;
}
