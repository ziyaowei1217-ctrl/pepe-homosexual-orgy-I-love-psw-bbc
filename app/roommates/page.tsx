import SubletApp from "@/components/sublet-app";

export default async function RoommatesPage({
  searchParams
}: {
  searchParams?: Promise<{ roommateId?: string }>;
}) {
  const params = await searchParams;

  return <SubletApp initialSection="Roommates" initialRoommateDmId={params?.roommateId ?? null} />;
}
