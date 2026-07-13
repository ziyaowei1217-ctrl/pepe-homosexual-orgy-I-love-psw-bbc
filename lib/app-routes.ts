export type RoutedAppSection =
  | "Discover"
  | "ListingDetail"
  | "Roommates"
  | "LikeQueue"
  | "Messages"
  | "Publish"
  | "Trips"
  | "Trust";

const sectionRoutes: Record<RoutedAppSection, string> = {
  Discover: "/",
  ListingDetail: "/",
  Roommates: "/roommates",
  LikeQueue: "/roommates/likes",
  Messages: "/messages",
  Publish: "/host/listings",
  Trips: "/trips",
  Trust: "/admin/trust"
};

export function routeForSection(section: RoutedAppSection) {
  return sectionRoutes[section];
}

export function discoverRouteForIntent(options: { groupTour?: boolean } = {}) {
  return options.groupTour ? "/?groupTour=1" : "/";
}

export function listingDetailRoute(listingId: string) {
  return `/?listingId=${encodeURIComponent(listingId)}`;
}

export type DmRouteTarget =
  | { kind: "listing"; id: string }
  | { kind: "roommate"; id: string };

export function dmRouteForTarget(target: DmRouteTarget, options: { tour?: boolean } = {}) {
  const param = target.kind === "listing" ? "listingId" : "roommateId";
  const route = "/messages";

  return `${route}?${param}=${encodeURIComponent(target.id)}${options.tour ? "&tour=1" : ""}`;
}

export function sectionForPathname(pathname: string): RoutedAppSection {
  if (pathname.startsWith("/messages")) return "Messages";
  if (pathname.startsWith("/roommates/likes")) return "LikeQueue";
  if (pathname.startsWith("/roommates")) return "Roommates";
  if (pathname.startsWith("/host/listings")) return "Publish";
  if (pathname.startsWith("/trips")) return "Trips";
  if (pathname.startsWith("/admin/trust")) return "Trust";

  return "Discover";
}

export function sectionForRoute(pathname: string, options: { listingId?: string | null } = {}) {
  if (pathname === "/" && options.listingId) return "ListingDetail";
  return sectionForPathname(pathname);
}
