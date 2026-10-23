import type { Metadata } from "next";
import { PublicShell } from "@/components/marketplace/public-shell";
import { SignInCompletion } from "@/components/marketplace/sign-in-completion";

export const metadata: Metadata = { title: "正在登录", robots: { index: false, follow: false } };
export default async function CompleteSignInPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <PublicShell active="account"><SignInCompletion failed={Boolean(params?.error)} /></PublicShell>;
}
