import SubletApp from "@/components/sublet-app";

export default async function MessagesPage({
  searchParams
}: {
  searchParams?: Promise<{ listingId?: string; roommateId?: string }>;
}) {
  const params = await searchParams;

  return (
    <SubletApp
      initialSection="Messages"
      initialMessageListingId={params?.listingId ?? null}
      initialRoommateDmId={params?.roommateId ?? null}
    />
  );
}
