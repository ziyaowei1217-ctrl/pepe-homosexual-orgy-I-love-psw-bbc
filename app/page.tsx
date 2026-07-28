import SubletApp from "@/components/sublet-app";

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ groupTour?: string; dealRoomId?: string; listingId?: string }>;
}) {
  const params = await searchParams;
  return (
    <SubletApp
      initialSection="Discover"
      initialGroupTourSelecting={params?.groupTour === "1"}
      initialGroupTourDealRoomId={params?.dealRoomId ?? null}
      initialListingId={params?.listingId ?? null}
    />
  );
}
