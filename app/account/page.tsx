import type { Metadata } from "next";
import { AccountExperience } from "@/components/marketplace/account-experience";
import { PublicShell } from "@/components/marketplace/public-shell";
import { getAuthIntent, getSafeAuthReturnTo } from "@/lib/app-routes";

export const metadata: Metadata = { title: "我的账户" };

export default async function AccountPage({
  searchParams
}: {
  searchParams?: Promise<{ returnTo?: string; intent?: string }>;
}) {
  const params = await searchParams;
  const returnTo = typeof params?.returnTo === "string" ? getSafeAuthReturnTo(params.returnTo) : null;
  const authIntent = getAuthIntent(params?.intent);
  return <PublicShell active="account"><AccountExperience mode="overview" returnTo={returnTo} authIntent={authIntent} /></PublicShell>;
}
