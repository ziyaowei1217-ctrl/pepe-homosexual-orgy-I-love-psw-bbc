import { redirect } from "next/navigation";

export default async function MessagesPage({
  searchParams
}: {
  searchParams?: Promise<{
    listingId?: string;
    roommateId?: string;
    conversationId?: string;
    dealRoomId?: string;
  }>;
}) {
  const params = await searchParams;

  if (params?.conversationId) redirect(`/inbox/${encodeURIComponent(params.conversationId)}`);
  const query = new URLSearchParams();
  if (params?.listingId) query.set("listingId", params.listingId);
  if (params?.roommateId) query.set("roommateId", params.roommateId);
  if (params?.dealRoomId) query.set("dealRoomId", params.dealRoomId);
  redirect(`/inbox${query.size ? `?${query.toString()}` : ""}`);
}
