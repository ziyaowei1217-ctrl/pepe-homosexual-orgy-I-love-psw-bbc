import { AdminDashboardExperience } from "@/components/marketplace/admin-experiences";
import { AdminShell } from "@/components/marketplace/workspace-shells";

export default function AdminPage() {
  return <AdminShell active="overview"><AdminDashboardExperience /></AdminShell>;
}
