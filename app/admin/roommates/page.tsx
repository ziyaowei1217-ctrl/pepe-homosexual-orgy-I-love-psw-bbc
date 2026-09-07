import { AdminRoommatesExperience } from "@/components/marketplace/admin-experiences";
import { AdminShell } from "@/components/marketplace/workspace-shells";

export default function AdminRoommatesPage() {
  return <AdminShell active="roommates"><AdminRoommatesExperience /></AdminShell>;
}
