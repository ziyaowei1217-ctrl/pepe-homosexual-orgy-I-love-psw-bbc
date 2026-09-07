import type { Metadata } from "next";

import { PublicShell } from "@/components/marketplace/public-shell";
import { RoommateTeamExperience } from "@/components/marketplace/roommate-team-experience";

export const metadata: Metadata = { title: "合租小组" };

export default function RoommateTeamsPage() {
  return <PublicShell active="roommates"><RoommateTeamExperience /></PublicShell>;
}
