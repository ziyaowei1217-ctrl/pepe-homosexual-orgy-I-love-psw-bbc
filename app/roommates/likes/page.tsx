import type { Metadata } from "next";

import { PublicShell } from "@/components/marketplace/public-shell";
import { RoommateLikesExperience } from "@/components/marketplace/roommate-experiences";

export const metadata: Metadata = { title: "喜欢与匹配" };

export default function RoommateLikesPage() {
  return <PublicShell active="roommates"><RoommateLikesExperience /></PublicShell>;
}
