import type { Metadata } from "next";

import { InboxExperience } from "@/components/marketplace/inbox-experience";
import { PublicShell } from "@/components/marketplace/public-shell";

export const metadata: Metadata = { title: "对话" };

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <PublicShell active="inbox"><InboxExperience initialConversationId={conversationId} /></PublicShell>;
}
