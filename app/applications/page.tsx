import type { Metadata } from "next";

import { ApplicationsExperience } from "@/components/marketplace/application-experiences";
import { PublicShell } from "@/components/marketplace/public-shell";

export const metadata: Metadata = { title: "我的申请" };

export default function ApplicationsPage() {
  return <PublicShell active="account"><ApplicationsExperience /></PublicShell>;
}
