import type { Metadata } from "next";

import { ApplicationDetailExperience } from "@/components/marketplace/application-experiences";
import { PublicShell } from "@/components/marketplace/public-shell";

export const metadata: Metadata = { title: "申请详情" };

export default async function ApplicationDetailPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return <PublicShell active="account"><ApplicationDetailExperience applicationId={applicationId} /></PublicShell>;
}
