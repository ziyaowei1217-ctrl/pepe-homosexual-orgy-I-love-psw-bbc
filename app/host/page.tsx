import type { Metadata } from "next";

import { HostDashboardExperience } from "@/components/marketplace/host-experiences";
import { HostShell } from "@/components/marketplace/workspace-shells";

export const metadata: Metadata = { title: "房东工作台" };

export default function HostDashboardPage() {
  return <HostShell active="overview"><HostDashboardExperience /></HostShell>;
}
