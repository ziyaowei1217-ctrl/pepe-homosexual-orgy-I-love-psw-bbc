import type { Metadata } from "next";
import { AccountExperience } from "@/components/marketplace/account-experience";
import { PublicShell } from "@/components/marketplace/public-shell";

export const metadata: Metadata = { title: "身份与认证" };

export default function AccountVerificationPage() {
  return <PublicShell active="account"><AccountExperience mode="verification" /></PublicShell>;
}
