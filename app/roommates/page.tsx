import type { Metadata } from "next";

import { PublicShell } from "@/components/marketplace/public-shell";
import { RoommatesExperience } from "@/components/marketplace/roommate-experiences";

export const metadata: Metadata = { title: "室友匹配" };

export default async function RoommatesPage({
  searchParams
}: {
  searchParams?: Promise<{ roommateId?: string }>;
}) {
  await searchParams;

  return <PublicShell active="roommates"><RoommatesExperience /></PublicShell>;
}
