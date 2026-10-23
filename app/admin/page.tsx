import type { Metadata } from "next";
import { AdminDashboardExperience } from "@/components/marketplace/admin-experiences";
import { AdminShell } from "@/components/marketplace/workspace-shells";

export const metadata: Metadata = { title: "审核概览" };

export default function AdminPage() {
  return <AdminShell active="overview"><AdminDashboardExperience /></AdminShell>;
}
