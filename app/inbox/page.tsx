import type { Metadata } from "next";

import { InboxExperience } from "@/components/marketplace/inbox-experience";
import { PublicShell } from "@/components/marketplace/public-shell";

export const metadata: Metadata = { title: "消息" };

export default async function InboxPage({ searchParams }: {
  searchParams?: Promise<{ conversationId?: string; listingId?: string; applicantId?: string; roommateId?: string; tour?: string }>;
}) {
  const params = await searchParams;

  return <PublicShell active="inbox"><InboxExperience initialConversationId={params?.conversationId ?? null} initialListingId={params?.listingId} initialApplicantId={params?.applicantId} initialRoommateId={params?.roommateId} initialTour={params?.tour === "1"} /></PublicShell>;
}
