export type RoutedAppSection =
  | "Discover"
  | "ListingDetail"
  | "Roommates"
  | "LikeQueue"
  | "Messages"
  | "Publish"
  | "Trips"
  | "Trust"
  | "AdminRoommates";

export type AuthIntent =
  | "account"
  | "message-host"
  | "request-viewing"
  | "roommate-action"
  | "roommate-message"
  | "application"
  | "messages"
  | "trips"
  | "publish";

const authIntents = new Set<AuthIntent>([
  "account",
  "message-host",
  "request-viewing",
  "roommate-action",
  "roommate-message",
  "application",
  "messages",
  "trips",
  "publish"
]);

export function getAuthIntent(value?: string | null): AuthIntent {
  return value && authIntents.has(value as AuthIntent)
    ? (value as AuthIntent)
    : "account";
}

export function authRoute({
  returnTo,
  intent = "account"
}: {
  returnTo: string;
  intent?: AuthIntent;
}) {
  const params = new URLSearchParams({ returnTo, intent });
  return `/account?${params.toString()}`;
}

export function getSafeAuthReturnTo(value?: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";

  const localOrigin = "https://sublet.local";
  try {
    const parsed = new URL(value, localOrigin);
    if (parsed.origin !== localOrigin || parsed.pathname.startsWith("/account")) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

const sectionRoutes: Record<RoutedAppSection, string> = {
  Discover: "/",
  ListingDetail: "/search",
  Roommates: "/roommates",
  LikeQueue: "/roommates/likes",
  Messages: "/inbox",
  Publish: "/host/listings",
  Trips: "/trips",
  Trust: "/admin/trust",
  AdminRoommates: "/admin/roommates"
};

export function routeForSection(section: RoutedAppSection) {
  return sectionRoutes[section];
}

export function discoverRouteForIntent(
  options: { groupTour?: boolean; dealRoomId?: string | null } = {}
) {
  if (!options.groupTour) return "/";
  return `/?groupTour=1${options.dealRoomId ? `&dealRoomId=${encodeURIComponent(options.dealRoomId)}` : ""}`;
}

export function listingDetailRoute(listingId: string) {
  return `/listing/${encodeURIComponent(listingId)}`;
}

export type DmRouteTarget =
  | { kind: "listing"; id: string }
  | { kind: "roommate"; id: string };

export function dmRouteForTarget(
  target: DmRouteTarget,
  options: { tour?: boolean; dealRoomId?: string | null; conversationId?: string | null } = {}
) {
  if (target.kind === "roommate" && options.conversationId) {
    return `/inbox/${encodeURIComponent(options.conversationId)}`;
  }
  const param = target.kind === "listing" ? "listingId" : "roommateId";
  const route = "/inbox";

  return `${route}?${param}=${encodeURIComponent(target.id)}${options.tour ? "&tour=1" : ""}${
    options.dealRoomId ? `&dealRoomId=${encodeURIComponent(options.dealRoomId)}` : ""
  }`;
}

export function sectionForPathname(pathname: string): RoutedAppSection {
  if (pathname.startsWith("/inbox") || pathname.startsWith("/messages")) return "Messages";
  if (pathname.startsWith("/listing/")) return "ListingDetail";
  if (pathname.startsWith("/roommates/likes")) return "LikeQueue";
  if (pathname.startsWith("/roommates")) return "Roommates";
  if (pathname.startsWith("/host/listings")) return "Publish";
  if (pathname.startsWith("/trips")) return "Trips";
  if (pathname.startsWith("/admin/roommates")) return "AdminRoommates";
  if (pathname.startsWith("/admin/trust")) return "Trust";

  return "Discover";
}

export function sectionForRoute(pathname: string, options: { listingId?: string | null } = {}) {
  if (pathname === "/" && options.listingId) return "ListingDetail";
  return sectionForPathname(pathname);
}
