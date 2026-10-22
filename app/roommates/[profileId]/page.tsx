import type { Metadata } from "next";

import { PublicShell } from "@/components/marketplace/public-shell";
import { RoommateDetailExperience } from "@/components/marketplace/roommate-experiences";

export const metadata: Metadata = { title: "室友详情" };

export default async function RoommateProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  return <PublicShell active="roommates"><RoommateDetailExperience profileId={profileId} /></PublicShell>;
}
