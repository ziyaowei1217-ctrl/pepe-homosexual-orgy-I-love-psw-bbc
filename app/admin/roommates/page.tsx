import type { Metadata } from "next";
import { AdminRoommatesExperience } from "@/components/marketplace/admin-experiences";
import { AdminShell } from "@/components/marketplace/workspace-shells";

export const metadata: Metadata = { title: "室友资料审核" };

export default function AdminRoommatesPage() {
  return <AdminShell active="roommates"><AdminRoommatesExperience /></AdminShell>;
}
