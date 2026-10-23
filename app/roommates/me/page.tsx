import type { Metadata } from "next";

import { PublicShell } from "@/components/marketplace/public-shell";
import { RoommateProfileEditor } from "@/components/marketplace/roommate-profile-form";

export const metadata: Metadata = { title: "室友资料" };

export default function RoommateProfileEditorPage() {
  return <PublicShell active="roommates"><RoommateProfileEditor /></PublicShell>;
}
