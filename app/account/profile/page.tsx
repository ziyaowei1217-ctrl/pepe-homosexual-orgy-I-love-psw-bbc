import type { Metadata } from "next";
import { AccountExperience } from "@/components/marketplace/account-experience";
import { PublicShell } from "@/components/marketplace/public-shell";

export const metadata: Metadata = { title: "个人资料" };

export default function AccountProfilePage() {
  return <PublicShell active="account"><AccountExperience mode="profile" /></PublicShell>;
}
