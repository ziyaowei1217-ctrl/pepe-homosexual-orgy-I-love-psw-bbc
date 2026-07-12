import SubletApp from "@/components/sublet-app";

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ groupTour?: string }> }) {
  const params = await searchParams;
  return <SubletApp initialSection="Discover" initialGroupTourSelecting={params?.groupTour === "1"} />;
}
