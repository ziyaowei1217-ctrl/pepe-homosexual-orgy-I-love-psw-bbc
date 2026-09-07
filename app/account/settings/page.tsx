import { AccountExperience } from "@/components/marketplace/account-experience";
import { PublicShell } from "@/components/marketplace/public-shell";

export default function AccountSettingsPage() {
  return <PublicShell active="account"><AccountExperience mode="settings" /></PublicShell>;
}
