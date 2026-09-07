import { AccountExperience } from "@/components/marketplace/account-experience";
import { PublicShell } from "@/components/marketplace/public-shell";

export default function AccountVerificationPage() {
  return <PublicShell active="account"><AccountExperience mode="verification" /></PublicShell>;
}
