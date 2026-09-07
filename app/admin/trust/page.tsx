import { AdminTrustExperience } from "@/components/marketplace/admin-experiences";
import { AdminShell } from "@/components/marketplace/workspace-shells";

export default function AdminTrustPage() {
  return <AdminShell active="trust"><AdminTrustExperience /></AdminShell>;
}
