import type { Metadata } from "next";

import { PublicShell } from "@/components/marketplace/public-shell";
import { TripsExperience } from "@/components/marketplace/trips-experience";

export const metadata: Metadata = { title: "我的租住" };

export default function TripsPage() {
  return <PublicShell active="account"><TripsExperience /></PublicShell>;
}
