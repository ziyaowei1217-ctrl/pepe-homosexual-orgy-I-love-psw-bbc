import type { Metadata } from "next";
import { AdminTrustExperience } from "@/components/marketplace/admin-experiences";
import { AdminShell } from "@/components/marketplace/workspace-shells";

export const metadata: Metadata = { title: "信任审核" };

export default function AdminTrustPage() {
  return <AdminShell active="trust"><AdminTrustExperience /></AdminShell>;
}
