export type RoutedAppSection =
  | "Discover"
  | "ListingDetail"
  | "Roommates"
  | "Messages"
  | "Publish"
  | "Trips"
  | "Trust";

const sectionRoutes: Record<RoutedAppSection, string> = {
  Discover: "/",
  ListingDetail: "/",
  Roommates: "/roommates",
  Messages: "/messages",
  Publish: "/host/listings",
  Trips: "/trips",
  Trust: "/admin/trust"
};

export function routeForSection(section: RoutedAppSection) {
  return sectionRoutes[section];
}

export type DmRouteTarget =
  | { kind: "listing"; id: string }
  | { kind: "roommate"; id: string };

export function dmRouteForTarget(target: DmRouteTarget) {
  const param = target.kind === "listing" ? "listingId" : "roommateId";
  const route = target.kind === "listing" ? "/messages" : "/roommates";

  return `${route}?${param}=${encodeURIComponent(target.id)}`;
}

export function sectionForPathname(pathname: string): RoutedAppSection {
  if (pathname.startsWith("/messages")) return "Messages";
  if (pathname.startsWith("/roommates")) return "Roommates";
  if (pathname.startsWith("/host/listings")) return "Publish";
  if (pathname.startsWith("/trips")) return "Trips";
  if (pathname.startsWith("/admin/trust")) return "Trust";

  return "Discover";
}
