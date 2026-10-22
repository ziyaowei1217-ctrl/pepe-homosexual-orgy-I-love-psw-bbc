import type { Metadata } from "next";
import { AccountExperience } from "@/components/marketplace/account-experience";
import { PublicShell } from "@/components/marketplace/public-shell";

export const metadata: Metadata = { title: "账户与隐私设置" };

export default function AccountSettingsPage() {
  return <PublicShell active="account"><AccountExperience mode="settings" /></PublicShell>;
}
