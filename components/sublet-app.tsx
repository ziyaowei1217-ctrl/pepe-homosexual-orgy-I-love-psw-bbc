"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  DollarSign,
  DoorOpen,
  GraduationCap,
  Heart,
  Home,
  LocateFixed,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Navigation,
  PawPrint,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrainFront,
  UserCheck,
  Users,
  Wifi,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { AuthFlowPanel } from "@/components/auth-flow-panel";
import { AdminRoommatesScreen } from "@/components/admin-roommates-screen";
import { AdminStepUpPanel } from "@/components/admin-step-up-panel";
import { AdminTrustScreen } from "@/components/admin-trust-screen";
import { ListingMediaUploader } from "@/components/listing-media-uploader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  apiGet,
  apiPatch,
  buildPublicListingsPath,
  getRoommateConversations,
  getRoommateMessages,
  getMyProfile,
  getSessionUser,
  markRoommateConversationRead,
  apiPost,
  sendRoommateMessage,
  updateMyProfile,
  type ApiProfile,
  type ApiDealRoom,
  type ApiListing,
  type ApiRoommate,
  type ApiRoommateActionResponse,
  type ApiRoommateConversation,
  type ApiTrustQueue,
  type ApiDealThread,
  type ApiViewingRequest,
  type SessionUser,
  type UpdateProfileInput,
  type VerifyEmailResponse,
  type CreateViewingRequestInput
} from "@/lib/api";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession
} from "@/lib/auth-session";
import { getActiveAdminStepUpToken, type AdminStepUpSession } from "@/lib/admin-step-up";
import {
  beginLatestRequest,
  commitLatestRequest,
  getPublishAccess,
  invalidateLatestRequests,
  isProfileComplete,
  runGuardedPublishAction,
  shouldClearAuthSession,
  shouldOpenNewUserOnboarding,
  type OnboardingReason,
  type ProfileLoadStatus,
  type PublishAccessResult
} from "@/lib/auth-flow";
import {
  discoverRouteForIntent,
  dmRouteForTarget,
  listingDetailRoute,
  routeForSection,
  sectionForRoute,
  type RoutedAppSection
} from "@/lib/app-routes";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  applyFlexibleStay,
  buildCalendarMonths,
  compareIsoDates,
  countNights,
  formatDateRangeLabel,
  formatShortDate,
  selectDateRange,
  type DateRange
} from "@/lib/date-range";
import {
  filterSavedListings,
  getListingCardDomId,
  getRequestedListing,
  getVisibleSelectedListing,
  isSelectedListing
} from "@/lib/listing-selection";
import {
  buildListingDetail,
  buildListingGallery,
  getGalleryIndex,
  getListingFlowStatus
} from "@/lib/listing-detail";
import {
  buildInitialDealThread,
  buildViewingSlots,
  canHostDecideViewing,
  canReuseDealThreadForViewing,
  createViewingRequest,
  getExistingRemoteThreadId,
  getExistingThreadDealRoomId,
  getComposerDraftAfterQuickReply,
  getDealWorkflowStage,
  getLatestViewingRequest,
  type DealThread,
  type ViewingRequest,
  type ViewingSlot
} from "@/lib/deal-workflow";
import { getListingStatusMeta, sortOwnerListings, type ListingStatus } from "@/lib/landlord-listings";
import {
  addLocalReminder,
  clearLegacyProductStorage,
  getUserUiStorageKey,
  markAllNotificationsRead,
  markNotificationRead,
  normalizeUserUiState,
  type LocalReminder
} from "@/lib/user-ui-state";
import { getUnreadNotificationCount } from "@/lib/notification-center";
import {
  getActiveInboxContact,
  getInboxContactKey,
  getNarrowMessagePane,
  mergeInboxContacts,
  type InboxContact
} from "@/lib/message-inbox";
import {
  applyRoommateReadState,
  createOptimisticRoommateMessage,
  getRoommateUnreadTotal,
  markRoommateMessageFailed,
  mergeRoommateMessageIntoConversations,
  mergeRoommateMessages,
  reconcileRoommateMessage,
  resolveRoommateConversationTarget,
  shouldReportRoommateRead,
  type RoommateMessageView
} from "@/lib/roommate-conversations";
import { createRoommateRealtimeClient } from "@/lib/roommate-realtime";
import { buildSearchInsight } from "@/lib/search-insights";
import {
  filterRoommatesByPreference,
  getRoommateDeckCandidates,
  rankRoommatesByPreference,
  type RankedRoommate,
  type RoommateGender,
  type RoommatePreference,
  type SharedLivingGenderPreference
} from "@/lib/roommate-preferences";
import { getRoommateConnectionStatus, type RoommateConnectionState, type RoommateConnectionStatus } from "@/lib/roommate-match-flow";
import {
  getRoommateStateKey,
  getThreadParticipantNames,
  hasCompleteRoommateGenderData,
  selectSingleDealRoom
} from "@/lib/roommate-product-data";
import { classifyRoommateQueue } from "@/lib/roommate-queue";
import {
  formatPriceRangeLabel,
  normalizePriceRange,
  priceFilterBounds
} from "@/lib/price-filter";
import {
  getMapCenterForListings,
  getMapMarkers,
  getMapSummary,
  getMapTiles,
  type MapSize,
  type MapPoint
} from "@/lib/listing-map";
import {
  buildCatalogPage,
  type CatalogSort
} from "@/lib/listing-catalog";
import { createPreviewListings, isPreviewDataEnabled } from "@/lib/preview-data";
import {
  checkProductCapability,
  type ProductCapability
} from "@/lib/product-capabilities";
import { ProductApiError, toProductApiError } from "@/lib/product-errors";
import type { ListingMediaSummary } from "@/lib/listing-media";
import {
  executePublishSave,
  getPublishStepErrors,
  mapApiListingToPublishDraft,
  type PublishDraft,
  type PublishSaveResult,
  type PublishStep
} from "@/lib/publish-listing";

type Listing = {
  id: string;
  title: string;
  area: string;
  image: string;
  price: number;
  originalPrice: number;
  beds: number;
  baths: number;
  commute: string;
  transit: string;
  trust: string;
  tags: string[];
  score: number;
  availableFrom?: string;
  availableTo?: string;
  latitude?: number;
  longitude?: number;
};

type Roommate = {
  id?: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  origin?: string;
  gender?: RoommateGender;
  school?: string;
  tags: string[];
};

type AppSection = RoutedAppSection;

type ViewMode = "map" | "list";

type SearchFilters = {
  query: string;
  checkIn: string;
  checkOut: string;
  priceMin: number;
  priceMax: number;
  amenity: string;
  sort: CatalogSort;
  page: number;
};

const previewDataEnabled = isPreviewDataEnabled();
const previewListings: Listing[] = previewDataEnabled ? createPreviewListings() : [];
const emptyListing: Listing = {
  id: "",
  title: "",
  area: "",
  image: "",
  price: 0,
  originalPrice: 0,
  beds: 0,
  baths: 0,
  commute: "",
  transit: "",
  trust: "",
  tags: [],
  score: 0
};

const seedRoommates: Roommate[] = [];

const roommateImages = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?auto=format&fit=crop&w=900&q=80"
];

const roommateNames = [
  "Mia Chen",
  "Ethan Liu",
  "Ava Zhang",
  "Leo Wang",
  "Sophie Lin",
  "Kevin Zhou",
  "Grace Xu",
  "Ryan Wu",
  "Ivy Huang",
  "Daniel Kim",
  "Nora Li",
  "Jason Yu",
  "Emily Zhao",
  "Aaron Sun",
  "Claire Guo",
  "Victor Tan",
  "Olivia Park",
  "Mark Chen",
  "Selina Ho",
  "Brian Ma"
];

const roommateRoles = [
  "UCLA MSBA · 秋季入学",
  "Culver City Product Intern",
  "USC Viterbi · CS",
  "Caltech Research Assistant",
  "Otis Design · Junior",
  "Burbank Studio Intern",
  "UCLA Extension · Film",
  "DTLA Finance Analyst",
  "USC Marshall · Fall",
  "Santa Monica SWE",
  "LMU MBA · Evening",
  "Glendale Animation Intern",
  "Pasadena ArtCenter",
  "El Segundo Aerospace PM",
  "Koreatown Healthcare Admin",
  "North Hollywood Editor",
  "UCLA Public Health",
  "Arts District Designer",
  "USC Annenberg",
  "Silver Lake Startup Ops"
];

const roommateTagSets = [
  ["早睡", "少做饭", "无宠物", "安静"],
  ["可合租", "周末社交", "爱干净", "健身"],
  ["会做饭", "猫友好", "不抽烟", "稳定"],
  ["通勤优先", "轻社交", "预算稳定", "长租可谈"],
  ["咖啡党", "不熬夜", "整洁", "接受访客"],
  ["宠物友好", "做饭频繁", "安静学习", "AA 清楚"]
];

const roommateGenders: RoommateGender[] = [
  "Woman",
  "Man",
  "Woman",
  "Man",
  "Woman",
  "Man",
  "Woman",
  "Man",
  "Woman",
  "Man",
  "Woman",
  "Man",
  "Woman",
  "Man",
  "Woman",
  "Man",
  "Woman",
  "Man",
  "Woman",
  "Man"
];

const roommateGenderOptions: SharedLivingGenderPreference[] = ["Open", "Women", "Men", "Non-binary"];

const roommateGenderLabels: Record<SharedLivingGenderPreference, string> = {
  Open: "不限",
  Women: "女性",
  Men: "男性",
  "Non-binary": "非二元"
};

const roommateSchoolOptions = ["UCLA", "USC", "Caltech", "LMU", "ArtCenter", "Other"];

const roommateHobbyOptions = [
  "早睡",
  "健身",
  "会做饭",
  "轻社交",
  "宠物友好",
  "安静",
  "爱干净",
  "学习友好"
];

const defaultRoommatePreference: RoommatePreference = {
  gender: "Open",
  budgetMin: 1200,
  budgetMax: 1800,
  schools: ["UCLA"],
  hobbies: ["早睡", "健身", "安静"]
};

function getRoommateSchool(role: string) {
  const normalizedRole = role.toLowerCase();
  const school = roommateSchoolOptions.find((option) => normalizedRole.includes(option.toLowerCase()));
  return school ?? "Other";
}

function createRoommates(): Roommate[] {
  const commuteZones = [
    "Westwood / Sawtelle",
    "Culver City / Santa Monica",
    "USC North / DTLA",
    "Pasadena / Glendale",
    "Playa Vista / Culver City",
    "Burbank / Hollywood",
    "DTLA / Arts District",
    "Koreatown / USC"
  ];

  return Array.from({ length: 20 }, (_, index) => {
    if (seedRoommates[index]) return seedRoommates[index];

    const budget = 1150 + ((index * 73) % 950);

    return {
      id: `preview-roommate-${index + 1}`,
      name: roommateNames[index % roommateNames.length],
      age: 20 + (index % 9),
      role: roommateRoles[index % roommateRoles.length],
      image: roommateImages[index % roommateImages.length],
      match: 82 + ((index * 3) % 17),
      budget: `$${budget.toLocaleString()}/月`,
      commute: commuteZones[index % commuteZones.length],
      gender: roommateGenders[index % roommateGenders.length],
      school: getRoommateSchool(roommateRoles[index % roommateRoles.length]),
      tags: roommateTagSets[index % roommateTagSets.length]
    };
  });
}

const listings = previewListings;
const roommates = previewDataEnabled ? createRoommates() : [];

const navItems: Array<{ label: string; section: AppSection }> = [
  { label: "找房", section: "Discover" },
  { label: "找室友", section: "Roommates" },
  { label: "消息", section: "Messages" },
  { label: "看房", section: "Trips" },
  { label: "发布", section: "Publish" }
];

const adminNavItems: Array<{ label: string; section: AppSection }> = [
  { label: "房源审核", section: "Trust" },
  { label: "室友管理", section: "AdminRoommates" }
];

const navIcons: Record<AppSection, LucideIcon> = {
  Discover: Home,
  ListingDetail: Home,
  Roommates: Users,
  LikeQueue: Heart,
  Messages: MessageCircle,
  Publish: DoorOpen,
  Trips: CalendarDays,
  Trust: ShieldCheck,
  AdminRoommates: UserCheck
};
const amenities = [
  { label: "全部", icon: SlidersHorizontal },
  { label: "Wi-Fi", icon: Wifi },
  { label: "独卫", icon: Bath },
  { label: "宠物", icon: PawPrint },
  { label: "近地铁", icon: TrainFront }
];

const defaultSearchFilters: SearchFilters = {
  query: "",
  checkIn: "",
  checkOut: "",
  priceMin: 0,
  priceMax: 4200,
  amenity: "全部",
  sort: "recommended",
  page: 1
};

const pricePresets = [
  { label: "$1.5k 以下", priceMin: 0, priceMax: 1500 },
  { label: "$2.5k 以下", priceMin: 0, priceMax: 2500 },
  { label: "$3.5k 以下", priceMin: 0, priceMax: 3500 },
  { label: "全部", priceMin: priceFilterBounds.min, priceMax: priceFilterBounds.max }
];

const defaultMapViewportSize = {
  width: 420,
  height: 360
};

function normalizeListing(listing: ApiListing): Listing {
  return {
    id: String(listing.id),
    title: listing.title,
    area: listing.area,
    image: listing.image,
    price: listing.price,
    originalPrice: listing.originalPrice,
    beds: listing.beds,
    baths: listing.baths,
    commute: listing.commute,
    transit: listing.transit,
    trust: listing.trust,
    tags: listing.tags,
    score: listing.score,
    availableFrom: listing.availableFrom?.slice(0, 10),
    availableTo: listing.availableTo?.slice(0, 10)
  };
}

function normalizeRoommate(roommate: ApiRoommate): Roommate {
  return {
    id: roommate.id,
    name: roommate.name,
    age: roommate.age,
    role: roommate.role,
    image: roommate.image,
    match: roommate.match,
    budget: roommate.budget,
    commute: roommate.commute,
    school: getRoommateSchool(roommate.role),
    tags: roommate.tags
  };
}

function getRoommatesFromDealRooms(dealRooms: ApiDealRoom[]): Roommate[] {
  const seen = new Set<string>();
  const members = dealRooms.flatMap((room) => room.members ?? []);

  return members.flatMap((member) => {
    if (!member.snapshot) return [];
    const roommate = normalizeRoommate(member.snapshot);
    const key = getRoommateKey(roommate);
    if (seen.has(key)) return [];
    seen.add(key);

    return [roommate];
  });
}

function getDealRoomLabel(dealRoom: ApiDealRoom) {
  const memberName = dealRoom.members?.find((member) => member.snapshot)?.snapshot?.name;
  return memberName ? `与 ${memberName} 的小组` : `小组 ${dealRoom.id.slice(-6)}`;
}

function getRoommateKey(roommate: Roommate) {
  return getRoommateStateKey(roommate);
}

function getRoommateBudgetValue(roommate: Roommate) {
  return Number(roommate.budget.replace(/[^0-9]/g, "")) || 0;
}

function getHostContactName(listing: Listing) {
  void listing;
  return "房东";
}

function getDealParticipantNames(groupMembers: Roommate[]) {
  return getThreadParticipantNames(groupMembers);
}

function buildThreadForListing(listing: Listing, groupMembers: Roommate[]) {
  return buildInitialDealThread({
    listing,
    contactName: getHostContactName(listing),
    participantNames: getDealParticipantNames(groupMembers)
  });
}

function buildCreateThreadPayload(listing: Listing, groupMembers: Roommate[], dealRoomId?: string) {
  void groupMembers;
  return {
    listingId: listing.id,
    ...(dealRoomId ? { dealRoomId } : {})
  };
}

function assertViewingThreadGroup(
  thread: Pick<DealThread, "dealRoomId">,
  requestedDealRoomId: string | null | undefined,
  enforceMatch = false
) {
  if (!enforceMatch || canReuseDealThreadForViewing(thread, requestedDealRoomId)) return;

  throw new ProductApiError({
    category: "validation",
    message: "这套房的现有看房会话属于另一个室友小组。请切回原小组后重试；当前暂不支持更换会话小组。",
    retryable: false
  });
}

function apiThreadToDealThread(apiThread: ApiDealThread, fallback: DealThread): DealThread {
  const messages =
    apiThread.messages.length > 0
      ? apiThread.messages.map((message) => ({
          id: message.id,
          author: message.align === "right" ? "我" : message.senderName,
          body: message.body,
          time: formatApiMessageTime(message.createdAt),
          align: message.align,
          status: message.status
        }))
      : fallback.messages;

  return {
    id: apiThread.id,
    listingId: apiThread.listingId,
    subject: apiThread.listingTitle,
    participants: Array.from(new Set(["房东", ...apiThread.participantNames])),
    participantNames: apiThread.participantNames,
    dealRoomId: apiThread.dealRoomId,
    viewerRole: apiThread.viewerRole,
    messages,
    lastActivityAt:
      apiThread.messages.length > 0
        ? Math.max(...apiThread.messages.map((message) => new Date(message.createdAt).getTime()))
        : fallback.lastActivityAt
  };
}

function apiViewingRequestToViewingRequest(request: ApiViewingRequest): ViewingRequest {
  return {
    id: request.id,
    listingId: request.listingId,
    listingTitle: request.listingTitle,
    area: request.area,
    timeLabel: request.timeLabel,
    iso: request.iso,
    mode: request.mode,
    participantNames: request.participantNames,
    status: request.status
  };
}

function formatApiMessageTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

const ROOMMATE_READ_RETRY_DELAY_MS = 1_000;
const ROOMMATE_READ_MAX_AUTO_RETRIES = 1;

export default function HomePage({
  initialSection,
  initialMessageListingId,
  initialRoommateDmId,
  initialRoommateConversationId,
  initialListingId,
  initialGroupTourSelecting = false,
  initialGroupTourDealRoomId = null,
  initialAuthPanelOpen = false
}: {
  initialSection?: AppSection;
  initialMessageListingId?: string | null;
  initialRoommateDmId?: string | null;
  initialRoommateConversationId?: string | null;
  initialListingId?: string | null;
  initialGroupTourSelecting?: boolean;
  initialGroupTourDealRoomId?: string | null;
  initialAuthPanelOpen?: boolean;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const startingSection = initialListingId
    ? sectionForRoute(pathname, { listingId: initialListingId })
    : initialSection ?? sectionForRoute(pathname);
  const initialSelectedListing =
    listings.find((listing) => listing.id === initialListingId) ??
    listings[0] ??
    emptyListing;
  const [allListings, setAllListings] = useState(listings);
  const [selectedListing, setSelectedListing] = useState(initialSelectedListing);
  const [apiRoommates, setApiRoommates] = useState<Roommate[]>(roommates);
  const [apiTrustQueues, setApiTrustQueues] = useState<ApiTrustQueue[]>([]);
  const [activeSection, setActiveSection] = useState<AppSection>(startingSection);
  const activeSectionRef = useRef(activeSection);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [savedOnly, setSavedOnly] = useState(false);
  const [groupTourSelecting, setGroupTourSelecting] = useState(initialGroupTourSelecting);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(defaultSearchFilters);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [contactedListingIds, setContactedListingIds] = useState<Set<string>>(
    () => new Set(initialMessageListingId ? [initialMessageListingId] : [])
  );
  const [tourRequestedListingIds, setTourRequestedListingIds] = useState<Set<string>>(new Set());
  const [dealThreads, setDealThreads] = useState<Record<string, DealThread>>({});
  const [viewingRequests, setViewingRequests] = useState<ViewingRequest[]>([]);
  const [notifications, setNotifications] = useState<LocalReminder[]>([]);
  const [userUiHydratedFor, setUserUiHydratedFor] = useState<string | null>(null);
  const [activeMessageListingId, setActiveMessageListingId] = useState<string | null>(initialMessageListingId ?? null);
  const [activeRoommateConversationId, setActiveRoommateConversationId] = useState<string | null>(
    initialRoommateConversationId ?? null
  );
  const [roommateConversations, setRoommateConversations] = useState<ApiRoommateConversation[]>([]);
  const [roommateConversationsLoaded, setRoommateConversationsLoaded] = useState(false);
  const [roommateMessages, setRoommateMessages] = useState<Record<string, RoommateMessageView[]>>({});
  const [roommateMessageCursors, setRoommateMessageCursors] = useState<Record<string, string | null>>({});
  const [roommateHistoryLoading, setRoommateHistoryLoading] = useState<Set<string>>(new Set());
  const [roommateHistoryErrors, setRoommateHistoryErrors] = useState<Record<string, string>>({});
  const [pendingReadMessageIds, setPendingReadMessageIds] = useState<Record<string, string>>({});
  const [desktopMessageLayout, setDesktopMessageLayout] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const activeRoommateConversationIdRef = useRef<string | null>(initialRoommateConversationId ?? null);
  const appliedRoommateRouteRef = useRef<string | null>(null);
  const roommateConversationRequestGenerationRef = useRef(0);
  const roommateHistoryRequestGenerationsRef = useRef<Record<string, number>>({});
  const roommateReadRetryAttemptsRef = useRef<
    Record<string, { messageId: string; attempts: number }>
  >({});
  const roommateReadRetryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [groupMembers, setGroupMembers] = useState<Roommate[]>([]);
  const [likedRoommateIds, setLikedRoommateIds] = useState<Set<string>>(new Set());
  const [likedMeRoommateIds, setLikedMeRoommateIds] = useState<Set<string>>(new Set());
  const [introSentRoommateIds] = useState<Set<string>>(new Set());
  const [skippedCount, setSkippedCount] = useState(0);
  const [tourRequested, setTourRequested] = useState(false);
  const [toast, setToast] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState(false);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [resolvedUserToken, setResolvedUserToken] = useState<string | null>(null);
  const [adminStepUpSession, setAdminStepUpSession] = useState<AdminStepUpSession | null>(null);
  const [adminStepUpOpen, setAdminStepUpOpen] = useState(false);
  const adminStepUpIdentityRef = useRef<string | null>(null);
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [profileStatus, setProfileStatus] =
    useState<ProfileLoadStatus>("idle");
  const profileRequestGuard = useRef(0);
  const [authPanelOpen, setAuthPanelOpen] = useState(initialAuthPanelOpen);
  const [onboardingReason, setOnboardingReason] =
    useState<OnboardingReason | null>(null);
  const [dealRooms, setDealRooms] = useState<ApiDealRoom[]>([]);
  const [activeDealRoomId, setActiveDealRoomId] = useState<string | null>(null);
  const [groupTourContext, setGroupTourContext] = useState<{
    dealRoomId: string;
    members: Roommate[];
  } | null>(null);
  const [myListings, setMyListings] = useState<ApiListing[]>([]);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const publishAccess = getPublishAccess({
    authenticated: Boolean(token && user),
    profile,
    profileStatus
  });
  const initialRoommateRouteKey = initialRoommateConversationId
    ? `conversation:${initialRoommateConversationId}`
    : initialRoommateDmId
      ? `peer:${initialRoommateDmId}`
      : null;
  const adminStepUpIdentity = token && user
    ? `${token}:${user.id}:${user.email}:${user.role}`
    : null;
  tokenRef.current = token;

  useEffect(() => {
    if (adminStepUpIdentityRef.current === adminStepUpIdentity) return;
    adminStepUpIdentityRef.current = adminStepUpIdentity;
    setAdminStepUpSession(null);
    setAdminStepUpOpen(false);
  }, [adminStepUpIdentity]);

  useEffect(() => {
    if (!adminStepUpSession) return;
    if (!getActiveAdminStepUpToken(adminStepUpSession)) {
      setAdminStepUpSession(null);
      return;
    }
    const delay = Date.parse(adminStepUpSession.reauthenticatedUntil) - Date.now();
    const timer = window.setTimeout(() => {
      setAdminStepUpSession((current) =>
        current?.reauthenticatedUntil === adminStepUpSession.reauthenticatedUntil
          ? null
          : current
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [adminStepUpSession]);

  useEffect(() => {
    const storedSession = readStoredAuthSession();
    if (storedSession) setToken(storedSession.accessToken);
    clearLegacyProductStorage(window.localStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateDesktopMessageLayout = () => setDesktopMessageLayout(mediaQuery.matches);
    updateDesktopMessageLayout();
    mediaQuery.addEventListener("change", updateDesktopMessageLayout);
    return () => mediaQuery.removeEventListener("change", updateDesktopMessageLayout);
  }, []);

  useEffect(() => {
    if (!user) {
      setFavoriteIds(new Set());
      setNotifications([]);
      setUserUiHydratedFor(null);
      return;
    }

    setUserUiHydratedFor(null);
    try {
      const raw = window.localStorage.getItem(getUserUiStorageKey(user.id));
      const stored = normalizeUserUiState(raw ? JSON.parse(raw) : null);
      setFavoriteIds(new Set(stored.favoriteListingIds));
      setNotifications(stored.notifications);
    } catch {
      setFavoriteIds(new Set());
      setNotifications([]);
    }
    setUserUiHydratedFor(user.id);
  }, [user]);

  useEffect(() => {
    if (initialMessageListingId) {
      setActiveMessageListingId(initialMessageListingId);
      setActiveRoommateConversationId(null);
      return;
    }

    setActiveMessageListingId(null);
    if (initialRoommateConversationId) {
      setActiveRoommateConversationId(initialRoommateConversationId);
    } else if (!initialRoommateDmId) {
      setActiveRoommateConversationId(null);
    }
  }, [initialMessageListingId, initialRoommateConversationId, initialRoommateDmId]);

  useEffect(() => {
    const nextSection = sectionForRoute(pathname, { listingId: initialListingId });
    activeSectionRef.current = nextSection;
    setActiveSection(nextSection);
  }, [initialListingId, pathname]);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    if (!user || userUiHydratedFor !== user.id) return;
    const state = {
      version: 2 as const,
      favoriteListingIds: Array.from(favoriteIds),
      notifications
    };
    window.localStorage.setItem(getUserUiStorageKey(user.id), JSON.stringify(state));
  }, [favoriteIds, notifications, user, userUiHydratedFor]);

  useEffect(() => {
    let cancelled = false;
    const listingsPath = buildPublicListingsPath({
      checkIn: filters.checkIn,
      checkOut: filters.checkOut
    });

    if (!listingsPath) return;
    const requestPath = listingsPath;

    async function loadListings() {
      try {
        const apiListings = await apiGet<ApiListing[]>(requestPath);
        if (cancelled) return;
        const nextListings = previewDataEnabled
          ? previewListings
          : apiListings.map(normalizeListing);
        setAllListings(nextListings);
        setSelectedListing((current) =>
          getRequestedListing(nextListings, initialListingId, current)
        );
        setApiError(null);
        setApiOnline(true);
        if (previewDataEnabled) setToast("正在使用开发预览数据。");
      } catch (error) {
        if (cancelled) return;
        const productError = toProductApiError(error);
        setApiError(productError.message);
        setApiOnline(false);
        if (!previewDataEnabled) {
          setAllListings([]);
          setSelectedListing(emptyListing);
        } else {
          setAllListings(previewListings);
          setSelectedListing((current) =>
            getRequestedListing(previewListings, initialListingId, current)
          );
          setToast("正在使用开发预览数据；正式服务当前不可用。");
        }
      }
    }

    void loadListings();

    return () => {
      cancelled = true;
    };
  }, [filters.checkIn, filters.checkOut, initialListingId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoommates() {
      try {
        const apiRoommateData = await apiGet<ApiRoommate[]>("/roommates");
        if (!cancelled) setApiRoommates(apiRoommateData.map(normalizeRoommate));
      } catch {
        if (!cancelled) setApiRoommates([]);
      }
    }

    void loadRoommates();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setResolvedUserToken(null);
    if (!token) {
      setProfileStatus("idle");
      return;
    }
    const currentToken = token;

    async function loadMe() {
      const requestVersion = beginLatestRequest(profileRequestGuard);
      setProfileStatus("loading");
      try {
        const [currentUser, currentProfile] = await Promise.all([
          getSessionUser(currentToken),
          getMyProfile(currentToken)
        ]);
        if (cancelled) return;
        commitLatestRequest(
          profileRequestGuard,
          requestVersion,
          () => {
            setUser(currentUser);
            setResolvedUserToken(currentToken);
            setProfile(currentProfile);
            setProfileStatus("loaded");
          }
        );
      } catch (error) {
        if (cancelled) return;
        commitLatestRequest(
          profileRequestGuard,
          requestVersion,
          () => {
            const productError = toProductApiError(error);
            if (shouldClearAuthSession(productError)) {
              clearStoredAuthSession();
              setToken(null);
              setUser(null);
              setResolvedUserToken(null);
              setProfile(null);
              setProfileStatus("idle");
              setToast(productError.message);
              setAuthPanelOpen(true);
            } else {
              setProfileStatus("error");
              setApiError(productError.message);
              setApiOnline(false);
            }
          }
        );
      }
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleAdminAuthenticationError(error: unknown) {
    const productError = toProductApiError(error);
    if (!shouldClearAuthSession(productError)) return false;
    clearStoredAuthSession();
    invalidateLatestRequests(profileRequestGuard);
    setAdminStepUpSession(null);
    setAdminStepUpOpen(false);
    setToken(null);
    setUser(null);
    setResolvedUserToken(null);
    setProfile(null);
    setProfileStatus("idle");
    setOnboardingReason(null);
    setAuthPanelOpen(true);
    setToast(productError.message);
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    setApiTrustQueues([]);
    if (!token || resolvedUserToken !== token || user?.role !== "ADMIN") return;

    void apiGet<ApiTrustQueue[]>("/trust/queues", token)
      .then((queues) => {
        if (!cancelled) setApiTrustQueues(queues);
      })
      .catch((error) => {
        if (cancelled) return;
        if (handleAdminAuthenticationError(error)) return;
        setToast(`审核指标加载失败：${toProductApiError(error).message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedUserToken, token, user?.role]);

  const handleRoommateApiError = useCallback((error: unknown, prefix = "") => {
    const productError = toProductApiError(error);
    if (shouldClearAuthSession(productError)) {
      clearStoredAuthSession();
      setToken(null);
      setUser(null);
      setProfile(null);
      setProfileStatus("idle");
      setAuthPanelOpen(true);
    }
    setToast(`${prefix}${productError.message}`);
    return productError.message;
  }, []);

  const applyRoommateConversationMutation = useCallback(
    (update: (current: ApiRoommateConversation[]) => ApiRoommateConversation[]) => {
      roommateConversationRequestGenerationRef.current += 1;
      setRoommateConversations((current) => update(current));
    },
    []
  );

  const clearRoommateReadRetry = useCallback((conversationId: string) => {
    const timer = roommateReadRetryTimersRef.current[conversationId];
    if (timer !== undefined) clearTimeout(timer);
    delete roommateReadRetryTimersRef.current[conversationId];
    delete roommateReadRetryAttemptsRef.current[conversationId];
  }, []);

  const clearAllRoommateReadRetries = useCallback(() => {
    for (const timer of Object.values(roommateReadRetryTimersRef.current)) {
      clearTimeout(timer);
    }
    roommateReadRetryTimersRef.current = {};
    roommateReadRetryAttemptsRef.current = {};
  }, []);

  const refreshRoommateConversations = useCallback(
    async (currentToken: string) => {
      const requestGeneration = roommateConversationRequestGenerationRef.current + 1;
      roommateConversationRequestGenerationRef.current = requestGeneration;
      const requestIsCurrent = () =>
        tokenRef.current === currentToken &&
        roommateConversationRequestGenerationRef.current === requestGeneration;
      try {
        const nextConversations = await getRoommateConversations(currentToken);
        if (!requestIsCurrent()) return null;
        setRoommateConversations(nextConversations);
        setRoommateConversationsLoaded(true);
        return nextConversations;
      } catch (error) {
        if (requestIsCurrent()) {
          handleRoommateApiError(error, "室友消息加载失败：");
        }
        return null;
      }
    },
    [handleRoommateApiError]
  );

  const refreshRoommateHistory = useCallback(
    async (currentToken: string, conversationId: string, cursor?: string) => {
      const requestGeneration =
        (roommateHistoryRequestGenerationsRef.current[conversationId] ?? 0) + 1;
      roommateHistoryRequestGenerationsRef.current[conversationId] = requestGeneration;
      const requestIsCurrent = () =>
        tokenRef.current === currentToken &&
        roommateHistoryRequestGenerationsRef.current[conversationId] === requestGeneration;
      setRoommateHistoryLoading((current) => new Set(current).add(conversationId));
      try {
        const page = cursor
          ? await getRoommateMessages(currentToken, conversationId, cursor)
          : await getRoommateMessages(currentToken, conversationId);
        if (!requestIsCurrent()) return null;
        setRoommateMessages((current) => {
          const existing = current[conversationId] ?? [];
          return {
            ...current,
            [conversationId]: mergeRoommateMessages(existing, page.messages)
          };
        });
        setRoommateMessageCursors((current) => ({
          ...current,
          [conversationId]: page.nextCursor
        }));
        setRoommateHistoryErrors((current) => {
          if (!(conversationId in current)) return current;
          const next = { ...current };
          delete next[conversationId];
          return next;
        });
        return page;
      } catch (error) {
        if (requestIsCurrent()) {
          const message = handleRoommateApiError(error);
          setRoommateHistoryErrors((current) => ({ ...current, [conversationId]: message }));
        }
        return null;
      } finally {
        if (requestIsCurrent()) {
          setRoommateHistoryLoading((current) => {
            const next = new Set(current);
            next.delete(conversationId);
            return next;
          });
        }
      }
    },
    [handleRoommateApiError]
  );

  useEffect(() => {
    setRoommateConversations([]);
    setRoommateConversationsLoaded(false);
    setRoommateMessages({});
    setRoommateMessageCursors({});
    setRoommateHistoryLoading(new Set());
    setRoommateHistoryErrors({});
    setPendingReadMessageIds({});
    clearAllRoommateReadRetries();
    appliedRoommateRouteRef.current = null;
    if (!token) {
      setActiveRoommateConversationId(null);
      return;
    }
    setActiveRoommateConversationId(initialRoommateConversationId ?? null);
    void refreshRoommateConversations(token);
  }, [
    clearAllRoommateReadRetries,
    initialRoommateConversationId,
    refreshRoommateConversations,
    token
  ]);

  useEffect(() => {
    if (!initialRoommateRouteKey || !roommateConversationsLoaded) return;
    if (appliedRoommateRouteRef.current === initialRoommateRouteKey) return;
    const resolved = resolveRoommateConversationTarget(roommateConversations, {
      conversationId: initialRoommateConversationId,
      peerProfileId: initialRoommateDmId
    });
    if (!resolved) {
      setActiveRoommateConversationId(null);
      setToast("无法打开这个室友会话，请从消息列表重新选择。");
      return;
    }
    appliedRoommateRouteRef.current = initialRoommateRouteKey;
    setActiveRoommateConversationId(resolved.id);
  }, [
    initialRoommateConversationId,
    initialRoommateDmId,
    initialRoommateRouteKey,
    roommateConversations,
    roommateConversationsLoaded
  ]);

  useEffect(() => {
    if (activeSection !== "Publish") return;

    if (publishAccess.status === "needs-auth") {
      setAuthPanelOpen(true);
      setOnboardingReason(null);
      return;
    }

    if (
      publishAccess.status === "needs-profile" ||
      publishAccess.status === "needs-role"
    ) {
      setAuthPanelOpen(true);
      setOnboardingReason("publish-required");
      return;
    }

    if (publishAccess.status === "allowed") {
      setOnboardingReason((current) =>
        current === "publish-required" ? null : current
      );
    }
  }, [activeSection, publishAccess.status]);

  useEffect(() => {
    setMyListings([]);
    setEditingListingId(null);
    setDealRooms([]);
    setActiveDealRoomId(null);
    setGroupTourContext(null);
    setDealThreads({});
    setViewingRequests([]);
    setContactedListingIds(new Set());
    setTourRequestedListingIds(new Set());
    setLikedRoommateIds(new Set());
    setLikedMeRoommateIds(new Set());
    setGroupMembers([]);
    setTourRequested(false);
    if (!token) return;

    let cancelled = false;
    const currentToken = token;

    async function loadOwnedListings() {
      try {
        const ownedListings = await apiGet<ApiListing[]>("/listings/mine", currentToken);
        if (cancelled) return;
        const sortedListings = sortOwnerListings(
          ownedListings.filter((listing): listing is ApiListing & { status: ListingStatus } => Boolean(listing.status))
        );
        setMyListings(sortedListings);
        setApiOnline(true);
      } catch (error) {
        if (!cancelled) setToast(`房东房源加载失败：${toProductApiError(error).message}`);
      }
    }

    async function loadDealRooms() {
      try {
        const nextDealRooms = await apiGet<ApiDealRoom[]>("/deal-rooms/active", currentToken);
        if (cancelled) return;
        const allDealRoomMembers = getRoommatesFromDealRooms(nextDealRooms);
        const routedDealRoom = initialGroupTourDealRoomId
          ? nextDealRooms.find((room) => room.id === initialGroupTourDealRoomId) ?? null
          : null;
        const activeDealRoom = routedDealRoom ?? selectSingleDealRoom(nextDealRooms);
        const activeDealRoomMembers = activeDealRoom
          ? getRoommatesFromDealRooms([activeDealRoom])
          : [];
        setDealRooms(nextDealRooms);
        setActiveDealRoomId(activeDealRoom?.id ?? null);
        const matchedIds = allDealRoomMembers.map(getRoommateKey);
        setLikedRoommateIds(new Set(matchedIds));
        setLikedMeRoommateIds(new Set(matchedIds));
        setGroupMembers(activeDealRoomMembers.slice(-4));
        setGroupTourContext(
          routedDealRoom
            ? {
                dealRoomId: routedDealRoom.id,
                members: activeDealRoomMembers.slice(-4)
              }
            : null
        );
        if (initialGroupTourDealRoomId && !routedDealRoom) {
          setGroupTourSelecting(false);
          setToast("所选室友小组已失效，请返回喜欢列表重新选择。");
        }
        setTourRequested(activeDealRoom?.tourRequest?.status === "REQUESTED");
        setApiOnline(true);
      } catch (error) {
        if (!cancelled) setToast(`室友小组加载失败：${toProductApiError(error).message}`);
      }
    }

    async function loadDealThreads() {
      try {
        const apiDealThreads = await apiGet<ApiDealThread[]>("/deal-threads", currentToken);
        if (cancelled) return;
        const nextThreads = Object.fromEntries(
          apiDealThreads.map((thread) => {
            const fallbackThread = buildInitialDealThread({
              listing: {
                id: thread.listingId,
                title: thread.listingTitle,
                area: thread.area
              },
              contactName: thread.contactName,
              participantNames: thread.participantNames
            });

            return [thread.listingId, apiThreadToDealThread(thread, fallbackThread)];
          })
        );
        const nextViewingRequests = apiDealThreads.flatMap((thread) =>
          thread.viewingRequests.map(apiViewingRequestToViewingRequest)
        );
        setDealThreads(nextThreads);
        setViewingRequests(nextViewingRequests);
        setContactedListingIds(new Set(apiDealThreads.map((thread) => thread.listingId)));
        setTourRequestedListingIds(new Set(nextViewingRequests.map((request) => request.listingId)));
        setApiOnline(true);
      } catch (error) {
        if (!cancelled) setToast(`消息与看房记录加载失败：${toProductApiError(error).message}`);
      }
    }

    void loadOwnedListings();
    void loadDealRooms();
    void loadDealThreads();
    return () => {
      cancelled = true;
    };
  }, [initialGroupTourDealRoomId, token]);

  const canRequestTour = groupMembers.length > 0;
  const catalogSource = useMemo(
    () => filterSavedListings(allListings, favoriteIds, savedOnly),
    [allListings, favoriteIds, savedOnly]
  );
  const catalogPage = useMemo(
    () =>
      buildCatalogPage(catalogSource, {
        ...filters,
        pageSize: 12
      }),
    [catalogSource, filters]
  );
  const visibleListings = catalogPage.items;
  const visibleSelectedListing = getVisibleSelectedListing(selectedListing, visibleListings);
  const viewingSlots = useMemo(
    () => buildViewingSlots(filters.checkIn || "2026-08-20"),
    [filters.checkIn]
  );
  const selectedDealThread = useMemo(
    () => dealThreads[selectedListing.id] ?? buildThreadForListing(selectedListing, groupMembers),
    [dealThreads, groupMembers, selectedListing]
  );
  const selectedDealStage = useMemo(
    () => getDealWorkflowStage(selectedDealThread, viewingRequests),
    [selectedDealThread, viewingRequests]
  );
  const messageListings = useMemo(() => {
    const messageListingIds = Array.from(new Set([...Array.from(contactedListingIds), ...Object.keys(dealThreads)]));

    return messageListingIds.flatMap((listingId) => {
      const listing = allListings.find((item) => item.id === listingId) ?? (selectedListing.id === listingId ? selectedListing : null);
      return listing ? [listing] : [];
    });
  }, [allListings, contactedListingIds, dealThreads, selectedListing]);
  const listingInboxContacts = useMemo<InboxContact[]>(
    () =>
      messageListings.map((listing) => {
        const thread = dealThreads[listing.id] ?? buildThreadForListing(listing, groupMembers);
        const latestMessage = thread.messages.at(-1);

        return {
          kind: "listing",
          targetId: listing.id,
          contactName: getHostContactName(listing),
          contextLabel: listing.title,
          preview: latestMessage?.body ?? "围绕这套房和房东沟通",
          time: latestMessage?.time ?? "",
          image: listing.image,
          activityOrder: thread.lastActivityAt
        };
      }),
    [dealThreads, groupMembers, messageListings]
  );
  const roommateInboxContacts = useMemo<InboxContact[]>(
    () =>
      roommateConversations.map((conversation) => ({
        kind: "roommate",
        targetId: conversation.id,
        contactName: conversation.peer.name ?? "室友",
        contextLabel: conversation.peer.role ?? "室友匹配",
        preview: conversation.latestMessage?.body ?? "开始聊聊入住计划",
        time: conversation.lastMessageAt ? formatApiMessageTime(conversation.lastMessageAt) : "",
        image: conversation.peer.image ?? "",
        activityOrder: new Date(conversation.lastMessageAt ?? conversation.updatedAt).getTime() || 0,
        unreadCount: conversation.unreadCount
      })),
    [roommateConversations]
  );
  const inboxContacts = useMemo(
    () => mergeInboxContacts(listingInboxContacts, roommateInboxContacts),
    [listingInboxContacts, roommateInboxContacts]
  );
  const requestedInboxTarget = activeMessageListingId
    ? { kind: "listing" as const, targetId: activeMessageListingId }
    : activeRoommateConversationId
      ? { kind: "roommate" as const, targetId: activeRoommateConversationId }
      : null;
  const routeInboxTarget = requestedInboxTarget;
  const narrowMessagePane = getNarrowMessagePane(routeInboxTarget);
  const roommateConversationPaneVisible =
    narrowMessagePane === "conversation" || desktopMessageLayout;
  const requestedInboxKey = routeInboxTarget ? getInboxContactKey(routeInboxTarget) : null;
  const requestedInboxContact = requestedInboxTarget
    ? inboxContacts.find(
        (contact) => getInboxContactKey(contact) === getInboxContactKey(requestedInboxTarget)
      ) ?? null
    : null;
  const hasExplicitInboxTarget = Boolean(initialMessageListingId || initialRoommateRouteKey);
  const activeInboxContact = requestedInboxTarget
    ? requestedInboxContact
    : hasExplicitInboxTarget
      ? null
      : getActiveInboxContact(inboxContacts, null);
  const activeMessageListing = useMemo(
    () =>
      activeInboxContact?.kind === "listing"
        ? messageListings.find((listing) => listing.id === activeInboxContact.targetId) ?? null
        : null,
    [activeInboxContact, messageListings]
  );
  const activeRoommateConversation = useMemo(
    () =>
      activeInboxContact?.kind === "roommate"
        ? roommateConversations.find(
            (conversation) => conversation.id === activeInboxContact.targetId
          ) ?? null
        : null,
    [activeInboxContact, roommateConversations]
  );
  const activeRoommateMessages = useMemo(
    () =>
      activeRoommateConversation
        ? roommateMessages[activeRoommateConversation.id] ?? []
        : [],
    [activeRoommateConversation, roommateMessages]
  );
  const roommateUnreadTotal = getRoommateUnreadTotal(roommateConversations);
  const activeMessageThread = useMemo(
    () =>
      activeMessageListing
        ? dealThreads[activeMessageListing.id] ?? buildThreadForListing(activeMessageListing, groupMembers)
        : null,
    [activeMessageListing, dealThreads, groupMembers]
  );
  const activeMessageViewingRequest = useMemo(
    () => (activeMessageListing ? getLatestViewingRequest(activeMessageListing.id, viewingRequests) : null),
    [activeMessageListing, viewingRequests]
  );
  const activeMessageStage = useMemo(
    () => (activeMessageThread ? getDealWorkflowStage(activeMessageThread, viewingRequests) : "暂无会话"),
    [activeMessageThread, viewingRequests]
  );

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, [activeSection, requestedInboxKey]);

  const activeRoommateConversationKey = activeRoommateConversation?.id ?? null;

  useEffect(() => {
    activeRoommateConversationIdRef.current = activeRoommateConversationKey;
    if (!token || !activeRoommateConversationKey) return;
    void refreshRoommateHistory(token, activeRoommateConversationKey);
  }, [activeRoommateConversationKey, refreshRoommateHistory, token]);

  useEffect(() => {
    if (!token) return;
    const currentToken = token;
    const synchronize = () => {
      clearAllRoommateReadRetries();
      setPendingReadMessageIds({});
      void refreshRoommateConversations(currentToken);
      const selectedConversationId = activeRoommateConversationIdRef.current;
      if (selectedConversationId) {
        void refreshRoommateHistory(currentToken, selectedConversationId);
      }
    };
    const client = createRoommateRealtimeClient({
      token: currentToken,
      onEvent: (event) => {
        if (tokenRef.current !== currentToken) return;
        if (event.name === "roommate.message.created") {
          setRoommateMessages((current) => ({
            ...current,
            [event.payload.conversationId]: mergeRoommateMessages(
              current[event.payload.conversationId] ?? [],
              [event.payload.message]
            )
          }));
          applyRoommateConversationMutation((current) =>
            mergeRoommateMessageIntoConversations(current, event.payload.message)
          );
          return;
        }
        if (event.name === "roommate.message.read") {
          clearRoommateReadRetry(event.payload.conversationId);
          applyRoommateConversationMutation((current) =>
            applyRoommateReadState(current, event.payload)
          );
          setPendingReadMessageIds((current) => {
            if (!(event.payload.conversationId in current)) return current;
            const next = { ...current };
            delete next[event.payload.conversationId];
            return next;
          });
          return;
        }
        void refreshRoommateConversations(currentToken);
      },
      onReconnect: synchronize
    });
    const synchronizeWhenVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      synchronize();
    };

    client.connect();
    const canListenToDocument =
      typeof document !== "undefined" && typeof document.addEventListener === "function";
    const canListenToWindow =
      typeof window !== "undefined" && typeof window.addEventListener === "function";
    if (canListenToDocument) {
      document.addEventListener("visibilitychange", synchronizeWhenVisible);
    }
    if (canListenToWindow) {
      window.addEventListener("focus", synchronizeWhenVisible);
    }
    return () => {
      if (canListenToDocument) {
        document.removeEventListener("visibilitychange", synchronizeWhenVisible);
      }
      if (canListenToWindow) {
        window.removeEventListener("focus", synchronizeWhenVisible);
      }
      client.disconnect();
    };
  }, [
    applyRoommateConversationMutation,
    clearAllRoommateReadRetries,
    clearRoommateReadRetry,
    refreshRoommateConversations,
    refreshRoommateHistory,
    token
  ]);

  useEffect(() => {
    if (!token || !activeRoommateConversation) return;
    const lastPeerMessage = [...activeRoommateMessages]
      .reverse()
      .find((message) => message.senderRole === "peer");
    const conversationId = activeRoommateConversation.id;
    const lastPeerMessageId = lastPeerMessage?.id ?? null;
    if (
      !shouldReportRoommateRead({
        activeConversationId: activeRoommateConversationIdRef.current,
        conversationId,
        conversationPaneVisible: roommateConversationPaneVisible,
        documentVisible:
          typeof document === "undefined" || document.visibilityState === "visible",
        lastPeerMessageId,
        lastReadMessageId: activeRoommateConversation.lastReadMessageId,
        pendingMessageId: pendingReadMessageIds[conversationId] ?? null
      }) ||
      !lastPeerMessageId
    ) {
      return;
    }

    setPendingReadMessageIds((current) => ({ ...current, [conversationId]: lastPeerMessageId }));
    void markRoommateConversationRead(token, conversationId, lastPeerMessageId)
      .then((state) => {
        if (tokenRef.current !== token) return;
        clearRoommateReadRetry(conversationId);
        applyRoommateConversationMutation((current) => applyRoommateReadState(current, state));
        setPendingReadMessageIds((current) => {
          if (current[conversationId] !== lastPeerMessageId) return current;
          const next = { ...current };
          delete next[conversationId];
          return next;
        });
      })
      .catch((error) => {
        if (tokenRef.current !== token) return;
        handleRoommateApiError(error);
        const currentRetry = roommateReadRetryAttemptsRef.current[conversationId];
        const retryAttempts =
          currentRetry?.messageId === lastPeerMessageId ? currentRetry.attempts : 0;
        if (retryAttempts >= ROOMMATE_READ_MAX_AUTO_RETRIES) return;

        roommateReadRetryAttemptsRef.current[conversationId] = {
          messageId: lastPeerMessageId,
          attempts: retryAttempts + 1
        };
        const existingTimer = roommateReadRetryTimersRef.current[conversationId];
        if (existingTimer !== undefined) clearTimeout(existingTimer);
        roommateReadRetryTimersRef.current[conversationId] = setTimeout(() => {
          delete roommateReadRetryTimersRef.current[conversationId];
          if (tokenRef.current !== token) return;
          setPendingReadMessageIds((current) => {
            if (current[conversationId] !== lastPeerMessageId) return current;
            const next = { ...current };
            delete next[conversationId];
            return next;
          });
        }, ROOMMATE_READ_RETRY_DELAY_MS);
      });
  }, [
    activeRoommateConversation,
    activeRoommateMessages,
    applyRoommateConversationMutation,
    clearRoommateReadRetry,
    handleRoommateApiError,
    pendingReadMessageIds,
    roommateConversationPaneVisible,
    token
  ]);

  function setActiveSectionAndTrack(section: AppSection) {
    activeSectionRef.current = section;
    setActiveSection(section);
  }

  function navigateToSection(section: AppSection) {
    setActiveSectionAndTrack(section);
    const route = routeForSection(section);
    if (route !== pathname) router.push(route);
  }

  function handleSelectInboxContact(contact: InboxContact) {
    setActiveSectionAndTrack("Messages");
    if (contact.kind === "listing") {
      setActiveMessageListingId(contact.targetId);
      setActiveRoommateConversationId(null);
      router.push(
        dmRouteForTarget(
          { kind: "listing", id: contact.targetId },
          { dealRoomId: getExistingThreadDealRoomId(dealThreads, contact.targetId) }
        )
      );
      return;
    }

    const conversation = roommateConversations.find((item) => item.id === contact.targetId);
    if (!conversation) return;
    setActiveMessageListingId(null);
    setActiveRoommateConversationId(conversation.id);
    router.push(
      dmRouteForTarget(
        { kind: "roommate", id: conversation.peer.id ?? conversation.id },
        { conversationId: conversation.id }
      )
    );
  }

  function handleBackToMessageContacts() {
    setActiveMessageListingId(null);
    setActiveRoommateConversationId(null);
    setActiveSectionAndTrack("Messages");
    router.push("/messages");
  }

  function handleSendRoommateMessage(conversation: ApiRoommateConversation, body: string) {
    const trimmedBody = body.trim();
    if (!token || !conversation.writable) return false;
    if (!trimmedBody || trimmedBody.length > 2000) {
      setToast("室友消息需为 1–2,000 个字符。");
      return false;
    }

    const optimistic = createOptimisticRoommateMessage({
      conversationId: conversation.id,
      clientMessageId: crypto.randomUUID(),
      body: trimmedBody,
      createdAt: new Date().toISOString()
    });
    setRoommateMessages((current) => ({
      ...current,
      [conversation.id]: mergeRoommateMessages(current[conversation.id] ?? [], [optimistic])
    }));
    applyRoommateConversationMutation((current) =>
      mergeRoommateMessageIntoConversations(current, optimistic)
    );
    void commitRoommateMessage(conversation.id, optimistic.clientMessageId, optimistic.body);
    return true;
  }

  function handleRetryRoommateMessage(message: RoommateMessageView) {
    if (!token || message.senderRole !== "self" || message.deliveryStatus !== "failed") return;
    setRoommateMessages((current) => ({
      ...current,
      [message.conversationId]: (current[message.conversationId] ?? []).map((candidate) =>
        candidate.clientMessageId === message.clientMessageId
          ? { ...candidate, deliveryStatus: "sending" }
          : candidate
      )
    }));
    void commitRoommateMessage(message.conversationId, message.clientMessageId, message.body);
  }

  async function commitRoommateMessage(conversationId: string, clientMessageId: string, body: string) {
    if (!token) return;
    const currentToken = token;
    try {
      const committed = await sendRoommateMessage(currentToken, conversationId, {
        clientMessageId,
        body
      });
      if (tokenRef.current !== currentToken) return;
      setRoommateMessages((current) => ({
        ...current,
        [conversationId]: reconcileRoommateMessage(current[conversationId] ?? [], committed)
      }));
      applyRoommateConversationMutation((current) =>
        mergeRoommateMessageIntoConversations(current, committed)
      );
    } catch (error) {
      if (tokenRef.current !== currentToken) return;
      setRoommateMessages((current) => ({
        ...current,
        [conversationId]: markRoommateMessageFailed(
          current[conversationId] ?? [],
          clientMessageId
        )
      }));
      handleRoommateApiError(error);
    }
  }

  function handleLoadOlderRoommateMessages(conversationId: string) {
    if (!token || roommateHistoryLoading.has(conversationId)) return;
    const cursor = roommateMessageCursors[conversationId];
    void refreshRoommateHistory(token, conversationId, cursor ?? undefined);
  }

  function requireCapability(capability: ProductCapability) {
    const result = checkProductCapability(capability, {
      authenticated: Boolean(token && user),
      apiOnline,
      profileRole: profile?.role
    });

    if (result.status === "allowed") return true;
    if (result.status === "requires-auth") {
      setAuthPanelOpen(true);
      if (capability !== "publish-listing") router.push("/account");
    }
    setToast(result.message);
    return false;
  }

  function setActionPending(key: string, pending: boolean) {
    setPendingActions((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function handleAmenityChange(amenity: string) {
    setFilters((current) => ({ ...current, amenity, page: 1 }));
    setToast(`已筛选设施：${amenity}`);
  }

  function handleFavorite(listingId: string) {
    if (!requireCapability("favorite-listing")) return;
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(listingId)) {
        next.delete(listingId);
        setToast("已取消收藏");
      } else {
        next.add(listingId);
        setToast("已加入收藏，仅保存在此设备。");
      }
      return next;
    });
  }

  function openListingDetail(listing: Listing) {
    setSelectedListing(listing);
    setActiveSectionAndTrack("ListingDetail");
    router.push(listingDetailRoute(listing.id));
    setToast(`正在查看房源详情：${listing.title}`);
  }

  function openListingThread(
    listing: Listing,
    options: { tour?: boolean; dealRoomId?: string | null }
  ) {
    setSelectedListing(listing);
    setActiveMessageListingId(listing.id);
    setContactedListingIds((current) => new Set(current).add(listing.id));
    router.push(dmRouteForTarget({ kind: "listing", id: listing.id }, options));
    setActiveSectionAndTrack("Messages");
    setToast(`已打开 ${listing.title} 的消息`);
  }

  async function handleContactListing(
    listing: Listing,
    options: { tour?: boolean; dealRoomId?: string | null; participantMembers?: Roommate[] } = {}
  ) {
    if (!requireCapability("message-host") || !token) return false;
    const requestedDealRoomId = options.tour
      ? options.dealRoomId ?? activeDealRoomId
      : activeDealRoomId;
    const requestedMembers = options.participantMembers ?? groupMembers;

    const pendingKey = `contact:${listing.id}`;
    setActionPending(pendingKey, true);

    try {
      const apiThread = await ensureRemoteDealThread(listing, {
        syncLocal: true,
        enforceDealRoomMatch: Boolean(options.tour),
        requestedDealRoomId,
        participantMembers: requestedMembers
      });
      if (!apiThread) return false;
      if (options.dealRoomId) {
        setActiveDealRoomId(options.dealRoomId);
        setGroupMembers(requestedMembers);
      }
      openListingThread(listing, options);
      return true;
    } catch (error) {
      setToast(toProductApiError(error).message);
      return false;
    } finally {
      setActionPending(pendingKey, false);
    }
  }

  async function ensureRemoteDealThread(
    listing: Listing,
    options: {
      syncLocal?: boolean;
      enforceDealRoomMatch?: boolean;
      requestedDealRoomId?: string | null;
      participantMembers?: Roommate[];
    } = {}
  ) {
    if (!token) return null;
    const syncLocal = options.syncLocal ?? true;
    const requestedDealRoomId =
      "requestedDealRoomId" in options ? options.requestedDealRoomId : activeDealRoomId;
    const participantMembers = options.participantMembers ?? groupMembers;
    const existingThread = dealThreads[listing.id];
    const existingThreadId = getExistingRemoteThreadId(dealThreads, listing.id);

    if (existingThreadId && existingThread) {
      assertViewingThreadGroup(existingThread, requestedDealRoomId, options.enforceDealRoomMatch);
      return { id: existingThreadId };
    }

    const remoteThreads = await apiGet<ApiDealThread[]>("/deal-threads", token);
    const remoteThread = remoteThreads.find((thread) => thread.listingId === listing.id);
    if (remoteThread) {
      assertViewingThreadGroup(remoteThread, requestedDealRoomId, options.enforceDealRoomMatch);
      if (syncLocal) {
        const fallbackThread = buildInitialDealThread({
          listing,
          contactName: remoteThread.contactName,
          participantNames: remoteThread.participantNames
        });
        setDealThreads((current) => ({
          ...current,
          [listing.id]: apiThreadToDealThread(remoteThread, current[listing.id] ?? fallbackThread)
        }));
        setViewingRequests((current) => [
          ...current.filter((request) => request.listingId !== listing.id),
          ...remoteThread.viewingRequests.map(apiViewingRequestToViewingRequest)
        ]);
        setContactedListingIds((current) => new Set(current).add(listing.id));
      }
      return remoteThread;
    }

    const fallbackThread = buildThreadForListing(listing, participantMembers);
    const apiThread = await apiPost<ApiDealThread>(
      "/deal-threads",
      buildCreateThreadPayload(listing, participantMembers, requestedDealRoomId ?? undefined),
      token
    );

    if (syncLocal) {
      setDealThreads((current) => ({
        ...current,
        [listing.id]: apiThreadToDealThread(apiThread, current[listing.id] ?? fallbackThread)
      }));
      setViewingRequests((current) => [
        ...current.filter((request) => request.listingId !== listing.id),
        ...apiThread.viewingRequests.map(apiViewingRequestToViewingRequest)
      ]);
    }

    return apiThread;
  }

  async function handleSendDealMessage(listing: Listing, body: string) {
    if (!requireCapability("message-host") || !token || !body.trim()) return false;
    const pendingKey = `message:${listing.id}`;
    setActionPending(pendingKey, true);

    try {
      const apiThread = await ensureRemoteDealThread(listing, { syncLocal: false });
      if (!apiThread) return false;
      const updatedThread = await apiPost<ApiDealThread>(
        `/deal-threads/${apiThread.id}/messages`,
        { body: body.trim() },
        token
      );
      const fallbackThread = dealThreads[listing.id] ?? buildThreadForListing(listing, groupMembers);
      setSelectedListing(listing);
      setActiveMessageListingId(listing.id);
      setContactedListingIds((current) => new Set(current).add(listing.id));
      setDealThreads((current) => ({
        ...current,
        [listing.id]: apiThreadToDealThread(updatedThread, current[listing.id] ?? fallbackThread)
      }));
      setNotifications((current) =>
        addLocalReminder(current, {
          id: `dm-${listing.id}-${Date.now()}`,
          title: `消息已发送给 ${getHostContactName(listing)}`,
          detail: listing.title,
          createdAt: Date.now(),
          read: false,
          target: dmRouteForTarget(
            { kind: "listing", id: listing.id },
            { dealRoomId: updatedThread.dealRoomId }
          )
        })
      );
      setToast("消息已发送");
      return true;
    } catch (error) {
      setToast(toProductApiError(error).message);
      return false;
    } finally {
      setActionPending(pendingKey, false);
    }
  }

  async function handleRequestListingTour(listing: Listing, slot = viewingSlots[0]) {
    if (!requireCapability("request-viewing") || !token) return false;
    if (!slot) {
      setToast("暂无可预约时间");
      return false;
    }
    const existingThread = dealThreads[listing.id];
    if (existingThread && !canReuseDealThreadForViewing(existingThread, activeDealRoomId)) {
      setToast("这套房的现有看房会话属于另一个室友小组。请切回原小组后重试；当前暂不支持更换会话小组。");
      return false;
    }

    const pendingKey = `tour:${listing.id}`;
    setActionPending(pendingKey, true);
    const participantNames =
      dealThreads[listing.id]?.participantNames?.length
        ? dealThreads[listing.id].participantNames!
        : getDealParticipantNames(groupMembers);
    const hasExistingActiveRequest = viewingRequests.some(
      (item) => item.listingId === listing.id && item.status !== "COMPLETED" && item.status !== "CANCELLED"
    );
    const request = createViewingRequest({
      listing,
      participantNames,
      previousCount: viewingRequests.filter((item) => item.listingId === listing.id).length,
      slot
    });

    try {
      const apiThread = await ensureRemoteDealThread(listing, {
        syncLocal: false,
        enforceDealRoomMatch: true,
        requestedDealRoomId: activeDealRoomId,
        participantMembers: groupMembers
      });
      if (!apiThread) return false;
      const payload: CreateViewingRequestInput = {
        timeLabel: request.timeLabel,
        iso: request.iso,
        mode: request.mode,
        participantNames: request.participantNames
      };
      const updatedThread = await apiPost<ApiDealThread>(
        `/deal-threads/${apiThread.id}/viewing-requests`,
        payload,
        token
      );
      const fallbackThread = dealThreads[listing.id] ?? buildThreadForListing(listing, groupMembers);
      const remoteRequests = updatedThread.viewingRequests.map(apiViewingRequestToViewingRequest);
      setSelectedListing(listing);
      setActiveMessageListingId(listing.id);
      setContactedListingIds((current) => new Set(current).add(listing.id));
      setTourRequestedListingIds((current) => new Set(current).add(listing.id));
      setDealThreads((current) => ({
        ...current,
        [listing.id]: apiThreadToDealThread(updatedThread, current[listing.id] ?? fallbackThread)
      }));
      setViewingRequests((current) => [
        ...current.filter((item) => item.listingId !== listing.id),
        ...remoteRequests
      ]);
      setNotifications((current) =>
        addLocalReminder(current, {
          id: `tour-${listing.id}`,
          title: hasExistingActiveRequest ? "看房时间已调整" : "看房请求已发送",
          detail: `${listing.title} · ${request.timeLabel}`,
          createdAt: Date.now(),
          read: false,
          target: "/trips"
        })
      );
      setToast(`看房请求已发送：${listing.title} · ${slot.label}`);
      return true;
    } catch (error) {
      setToast(toProductApiError(error).message);
      return false;
    } finally {
      setActionPending(pendingKey, false);
    }
  }

  async function handleViewingDecision(
    listing: Listing,
    request: ViewingRequest,
    decision: "confirm" | "decline"
  ) {
    if (!token) return false;
    const thread = dealThreads[listing.id];
    if (!thread || !canHostDecideViewing(thread, request)) return false;
    const pendingKey = `viewing-decision:${request.id}`;
    setActionPending(pendingKey, true);
    try {
      const updated = await apiPost<ApiDealThread>(
        `/deal-threads/${thread.id}/viewing-requests/${request.id}/${decision}`,
        {},
        token
      );
      setDealThreads((current) => ({
        ...current,
        [listing.id]: apiThreadToDealThread(updated, current[listing.id] ?? thread)
      }));
      setViewingRequests((current) => [
        ...current.filter((item) => item.listingId !== listing.id),
        ...updated.viewingRequests.map(apiViewingRequestToViewingRequest)
      ]);
      setToast(decision === "confirm" ? "看房请求已确认" : "看房请求已拒绝");
      return true;
    } catch (error) {
      setToast(toProductApiError(error).message);
      return false;
    } finally {
      setActionPending(pendingKey, false);
    }
  }

  function handleStartApplication(listing: Listing) {
    setSelectedListing(listing);
    setToast("在线申请、支付与托管暂未开放。");
  }

  async function handleAcceptRoommate(targetRoommate: Roommate) {
    if (!requireCapability("roommate-action") || !token || !targetRoommate.id) return false;
    const targetKey = getRoommateKey(targetRoommate);
    const pendingKey = `roommate:${targetKey}`;
    setActionPending(pendingKey, true);

    try {
      const response = await apiPost<ApiRoommateActionResponse>(
        `/roommates/${targetRoommate.id}/actions`,
        { action: "LIKE" },
        token
      );
      setLikedRoommateIds((current) => new Set(current).add(targetKey));
      setTourRequested(false);
      if (response.dealRoom) {
        const responseDealRoom: ApiDealRoom =
          response.dealRoom.members?.length
            ? response.dealRoom
            : {
                ...response.dealRoom,
                members: [{ snapshot: targetRoommate }]
              };
        setLikedMeRoommateIds((current) => new Set(current).add(targetKey));
        setDealRooms((current) => [
          responseDealRoom,
          ...current.filter((room) => room.id !== responseDealRoom.id)
        ]);
        setActiveDealRoomId(responseDealRoom.id);
        setGroupMembers(getRoommatesFromDealRooms([responseDealRoom]).slice(-4));
      }
      if (response.conversation) {
        setLikedMeRoommateIds((current) => new Set(current).add(targetKey));
        await refreshRoommateConversations(token);
        setActiveMessageListingId(null);
        setActiveRoommateConversationId(response.conversation.id);
        setActiveSectionAndTrack("Messages");
        router.push(
          dmRouteForTarget(
            { kind: "roommate", id: targetRoommate.id },
            { conversationId: response.conversation.id }
          )
        );
        setToast(`你和 ${targetRoommate.name} 已互相匹配，可以开始聊天。`);
      } else if (response.dealRoom) {
        setToast(`你和 ${targetRoommate.name} 已互相匹配。`);
      } else {
        setToast(`已喜欢 ${targetRoommate.name}，等待对方回应。`);
      }
      return true;
    } catch (error) {
      setToast(toProductApiError(error).message);
      return false;
    } finally {
      setActionPending(pendingKey, false);
    }
  }

  function handleSendRoommateIntro(targetRoommate: Roommate) {
    handleOpenRoommateDm(targetRoommate);
  }

  function handleOpenRoommateDm(targetRoommate: Roommate) {
    if (!requireCapability("roommate-message")) return;
    const conversation = roommateConversations.find(
      (item) => item.peer.id === targetRoommate.id
    );
    if (!conversation) {
      setToast("双方互相喜欢后，室友私信会自动创建。");
      return;
    }
    setActiveMessageListingId(null);
    setActiveRoommateConversationId(conversation.id);
    setActiveSectionAndTrack("Messages");
    router.push(
      dmRouteForTarget(
        { kind: "roommate", id: targetRoommate.id ?? conversation.id },
        { conversationId: conversation.id }
      )
    );
  }

  async function handleDecideRoommate(targetRoommate: Roommate) {
    setToast(`${targetRoommate.name} 的组队确认功能暂未开放。`);
    return false;
  }

  async function handleRejectRoommate(targetRoommate: Roommate) {
    if (!requireCapability("roommate-action") || !token || !targetRoommate.id) return false;
    const pendingKey = `roommate:${getRoommateKey(targetRoommate)}`;
    setActionPending(pendingKey, true);

    try {
      await apiPost(`/roommates/${targetRoommate.id}/actions`, { action: "PASS" }, token);
      setSkippedCount((current) => current + 1);
      setTourRequested(false);
      setToast(`已跳过 ${targetRoommate.name}`);
      return true;
    } catch (error) {
      setToast(toProductApiError(error).message);
      return false;
    } finally {
      setActionPending(pendingKey, false);
    }
  }

  async function handleLaterRoommate(targetRoommate: Roommate) {
    if (!requireCapability("roommate-action") || !token || !targetRoommate.id) return false;
    const pendingKey = `roommate:${getRoommateKey(targetRoommate)}`;
    setActionPending(pendingKey, true);

    try {
      await apiPost(`/roommates/${targetRoommate.id}/actions`, { action: "LATER" }, token);
      setTourRequested(false);
      setToast(`${targetRoommate.name} 已放入稍后查看`);
      return true;
    } catch (error) {
      setToast(toProductApiError(error).message);
      return false;
    } finally {
      setActionPending(pendingKey, false);
    }
  }

  function handleSelectDealRoom(dealRoomId: string) {
    const selectedRoom = dealRooms.find((room) => room.id === dealRoomId);
    if (!selectedRoom) return;
    const selectedMembers = getRoommatesFromDealRooms([selectedRoom]);
    setActiveDealRoomId(selectedRoom.id);
    setGroupMembers(selectedMembers.slice(-4));
    setGroupTourContext(null);
    setTourRequested(selectedRoom.tourRequest?.status === "REQUESTED");
    setToast(`当前小组已切换为：${getDealRoomLabel(selectedRoom)}`);
  }

  async function handleRequestGroupTour() {
    if (!canRequestTour || !activeDealRoomId) {
      setToast("服务端确认室友小组后，才能发起小组看房。");
      return;
    }

    setGroupTourContext({
      dealRoomId: activeDealRoomId,
      members: groupMembers
    });
    setGroupTourSelecting(true);
    setSavedOnly(false);
    setActiveSectionAndTrack("Discover");
    router.push(discoverRouteForIntent({ groupTour: true, dealRoomId: activeDealRoomId }));
    setToast("请选择一套房源，再到消息页明确选择小组看房时间。");
  }

  async function handleSaveListing(draft: PublishDraft, shouldSubmit: boolean) {
    const attempt = await runGuardedPublishAction(
      {
        authenticated: Boolean(token && user),
        profile,
        profileStatus
      },
      async () => {
        if (!requireCapability("publish-listing") || !token) return null;
        setIsPublishing(true);

        try {
          const result = await executePublishSave(
            draft,
            {
              create: (payload) => apiPost<ApiListing>("/listings", payload, token),
              update: (id, payload) => apiPatch<ApiListing>(`/listings/${id}`, payload, token),
              submit: (id) => apiPost(`/listings/${id}/submit`, {}, token)
            },
            shouldSubmit
          );
          let refreshFailed = false;
          try {
            const ownedListings = await apiGet<ApiListing[]>("/listings/mine", token);
            setMyListings(
              sortOwnerListings(
                ownedListings.filter((listing): listing is ApiListing & { status: ListingStatus } => Boolean(listing.status))
              )
            );
          } catch {
            refreshFailed = true;
          }
          setToast(
            refreshFailed
              ? `${result.message} 房源列表暂未刷新，草稿编号已保留，可继续重试。`
              : result.message
          );
          return result;
        } catch (error) {
          setToast(toProductApiError(error).message);
          return null;
        } finally {
          setIsPublishing(false);
        }
      }
    );

    if (attempt.gate.status !== "allowed") {
      setAuthPanelOpen(true);
      if (
        attempt.gate.status === "needs-profile" ||
        attempt.gate.status === "needs-role"
      ) {
        setOnboardingReason("publish-required");
      } else if (attempt.gate.status === "needs-auth") {
        setOnboardingReason(null);
      }
      setToast(attempt.gate.message);
      return null;
    }

    return attempt.value;
  }

  function handleAuthenticated(response: VerifyEmailResponse) {
    writeStoredAuthSession(response.accessToken);
    setAdminStepUpSession(null);
    setAdminStepUpOpen(false);
    setToken(response.accessToken);
    setUser(response.user);
    setAuthPanelOpen(true);
    setOnboardingReason(
      shouldOpenNewUserOnboarding({
        isNewUser: response.isNewUser,
        profile
      })
        ? "new-user"
        : null
    );
  }

  function handleLogout() {
    clearStoredAuthSession();
    invalidateLatestRequests(profileRequestGuard);
    setAdminStepUpSession(null);
    setAdminStepUpOpen(false);
    setToken(null);
    setUser(null);
    setProfile(null);
    setProfileStatus("idle");
    setOnboardingReason(null);
    setAuthPanelOpen(false);
    setToast("已退出登录");
  }

  async function refreshPublicCatalog() {
    const refreshedListings = await apiGet<ApiListing[]>("/listings");
    const nextListings = previewDataEnabled
      ? previewListings
      : refreshedListings.map(normalizeListing);
    setAllListings(nextListings);
    setSelectedListing((current) =>
      getRequestedListing(nextListings, initialListingId, current)
    );
  }

  async function refreshTrustMetrics() {
    if (!token || user?.role !== "ADMIN") return;
    const queues = await apiGet<ApiTrustQueue[]>("/trust/queues", token);
    setApiTrustQueues(queues);
  }

  async function handleSaveProfile(
    draft: UpdateProfileInput
  ): Promise<ApiProfile | null> {
    if (!token) {
      setToast("请先登录再完善资料");
      setAuthPanelOpen(true);
      return null;
    }

    try {
      const updatedProfile = await updateMyProfile(token, draft);
      invalidateLatestRequests(profileRequestGuard);
      setProfile(updatedProfile);
      setProfileStatus("loaded");
      const nextPublishAccess = getPublishAccess({
        authenticated: Boolean(token && user),
        profile: updatedProfile,
        profileStatus: "loaded"
      });
      const shouldContinuePublishing =
        activeSectionRef.current === "Publish" &&
        nextPublishAccess.status === "allowed";

      if (isProfileComplete(updatedProfile)) setOnboardingReason(null);

      if (shouldContinuePublishing) {
        setAuthPanelOpen(false);
        setToast("身份已保存，可以开始填写房源");
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            if (typeof document === "undefined") return;
            document.getElementById("publish-flow")?.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
          });
        }
      } else {
        setToast("资料已保存");
      }
      return updatedProfile;
    } catch (error) {
      setToast(toProductApiError(error).message);
      return null;
    }
  }

  const showAuthStrip =
    pathname.startsWith("/account") ||
    (activeSection === "Publish"
      ? publishAccess.status !== "allowed"
      : authPanelOpen);

  return (
    <main
      className={cn(
        "min-h-screen bg-background",
        user?.role === "ADMIN"
          ? "[--app-header-offset:9rem]"
          : "[--app-header-offset:6rem]"
      )}
    >
      <AppHeader
        favoriteCount={favoriteIds.size}
        messageUnreadCount={roommateUnreadTotal}
        savedOnly={savedOnly}
        notifications={notifications}
        notificationsOpen={notificationsOpen}
        activeSection={activeSection}
        onSectionChange={navigateToSection}
        onSavedHomes={() => {
          if (!requireCapability("favorite-listing")) return;
          setSavedOnly((current) => !current);
          setActiveSectionAndTrack("Discover");
          router.push("/");
        }}
        onNotifications={() => {
          setNotificationsOpen((current) => !current);
        }}
        onNotificationOpen={(notification) => {
          setNotifications((current) => markNotificationRead(current, notification.id));
          setNotificationsOpen(false);
          router.push(notification.target);
        }}
        onMarkAllNotifications={() => setNotifications((current) => markAllNotificationsRead(current))}
        user={user}
        profile={profile}
        onAuthOpen={() => {
          setAuthPanelOpen(true);
          if (!pathname.startsWith("/account")) router.push("/account");
        }}
        onLogout={handleLogout}
      />
      {showAuthStrip ? (
        <AuthFlowPanel
          token={token}
          user={user}
          profile={profile}
          apiError={apiError}
          onboardingReason={onboardingReason}
          isPinnedToPublish={activeSection === "Publish"}
          onAuthenticated={handleAuthenticated}
          onProfileSave={handleSaveProfile}
          onOnboardingDismiss={() => setOnboardingReason(null)}
          onLogout={handleLogout}
          onClose={() => setAuthPanelOpen(false)}
          onToast={setToast}
        />
      ) : null}
      <AdminStepUpPanel
        open={adminStepUpOpen}
        sessionToken={token ?? ""}
        email={user?.email ?? ""}
        onVerified={(session) => {
          setAdminStepUpSession(session);
          setAdminStepUpOpen(false);
        }}
        onCancel={() => setAdminStepUpOpen(false)}
        onAuthenticationError={handleAdminAuthenticationError}
      />
      {activeSection === "Discover" ? (
        <DiscoverScreen
          filters={filters}
          listings={visibleListings}
          totalListingCount={catalogPage.total}
          page={catalogPage.page}
          pageCount={catalogPage.pageCount}
          heading={catalogPage.heading}
          summary={catalogPage.summary}
          previewDataEnabled={previewDataEnabled}
          serviceUnavailable={Boolean(apiError) && !previewDataEnabled}
          selectedListing={visibleSelectedListing}
          favoriteIds={favoriteIds}
          viewMode={viewMode}
          listingActionLabel={groupTourSelecting ? "选择用于小组看房" : "打开详情"}
          onFiltersChange={(next) => setFilters({ ...next, page: next.page || 1 })}
          onAmenityChange={handleAmenityChange}
          onClear={() => {
            setFilters({ ...defaultSearchFilters, query: "" });
            setToast("筛选条件已重置");
          }}
          onPreview={(listing) => {
            setSelectedListing(listing);
            setToast(`已选中：${listing.title}`);
          }}
          onOpenListing={(listing) => {
            if (groupTourSelecting) {
              const pinnedTourContext = groupTourContext;
              const pinnedDealRoomId = pinnedTourContext?.dealRoomId ?? activeDealRoomId;
              if (!pinnedDealRoomId) {
                setToast("正在加载所选室友小组，请稍后重试。");
                return;
              }
              void handleContactListing(listing, {
                tour: true,
                dealRoomId: pinnedDealRoomId,
                participantMembers: pinnedTourContext?.members ?? groupMembers
              }).then((opened) => {
                if (!opened) return;
                setGroupTourSelecting(false);
                setGroupTourContext(null);
              });
            } else {
              openListingDetail(listing);
            }
          }}
          onFavorite={handleFavorite}
          onViewModeChange={setViewMode}
          onOpenRoommates={() => navigateToSection("Roommates")}
          onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
        />
      ) : null}
      {activeSection === "ListingDetail" ? (
        <ListingDetailScreen
          listing={selectedListing}
          filters={filters}
          favoriteIds={favoriteIds}
          contactedIds={contactedListingIds}
          tourRequestedIds={tourRequestedListingIds}
          dealStage={selectedDealStage}
          groupMembers={groupMembers}
          onBack={() => {
            setActiveSectionAndTrack("Discover");
            router.push("/");
          }}
          onFavorite={handleFavorite}
          onContact={handleContactListing}
          onRequestTour={(listing) => handleContactListing(listing, { tour: true })}
          onApply={handleStartApplication}
          onOpenRoommates={() => navigateToSection("Roommates")}
        />
      ) : null}
      {activeSection === "Roommates" ? (
        <RoommatesMarketplaceScreen
          roommates={apiRoommates}
          groupMembers={groupMembers}
          likedRoommateIds={likedRoommateIds}
          likedMeRoommateIds={likedMeRoommateIds}
          introSentRoommateIds={introSentRoommateIds}
          skippedCount={skippedCount}
          pendingRoommateIds={pendingActions}
          onLike={handleAcceptRoommate}
          onLater={handleLaterRoommate}
          onPass={handleRejectRoommate}
          onSendIntro={handleSendRoommateIntro}
          onOpenDm={handleOpenRoommateDm}
          onDecideRoommate={handleDecideRoommate}
          onOpenDiscover={() => navigateToSection("Discover")}
          onOpenLikeQueue={() => navigateToSection("LikeQueue")}
        />
      ) : null}
      {activeSection === "LikeQueue" ? (
        <LikeQueueScreen
          roommates={apiRoommates}
          members={groupMembers}
          dealRooms={dealRooms}
          activeDealRoomId={activeDealRoomId}
          likedRoommateIds={likedRoommateIds}
          likedMeRoommateIds={likedMeRoommateIds}
          introSentRoommateIds={introSentRoommateIds}
          tourRequested={tourRequested}
          onOpenRoommates={() => navigateToSection("Roommates")}
          onOpenMessages={() => navigateToSection("Messages")}
          onOpenDm={handleOpenRoommateDm}
          onDecideRoommate={handleDecideRoommate}
          onSelectDealRoom={handleSelectDealRoom}
          onRequestTour={handleRequestGroupTour}
        />
      ) : null}
      {activeSection === "Messages" ? (
        <MessagesScreen
          contacts={inboxContacts}
          activeContact={activeInboxContact}
          selectedListing={activeMessageListing}
          selectedRoommateConversation={activeRoommateConversation}
          roommateMessages={activeRoommateMessages}
          roommateNextCursor={
            activeRoommateConversation
              ? roommateMessageCursors[activeRoommateConversation.id] ?? null
              : null
          }
          roommateHistoryLoading={
            activeRoommateConversation
              ? roommateHistoryLoading.has(activeRoommateConversation.id)
              : false
          }
          roommateHistoryError={
            activeRoommateConversation
              ? roommateHistoryErrors[activeRoommateConversation.id] ?? null
              : null
          }
          dealStage={activeMessageStage}
          dealThread={activeMessageThread}
          latestViewingRequest={activeMessageViewingRequest}
          narrowPane={narrowMessagePane}
          viewingSlots={viewingSlots}
          pendingActions={pendingActions}
          onSendMessage={handleSendDealMessage}
          onSendRoommateMessage={handleSendRoommateMessage}
          onRetryRoommateMessage={handleRetryRoommateMessage}
          onLoadOlderRoommateMessages={handleLoadOlderRoommateMessages}
          onRequestTour={handleRequestListingTour}
          onViewingDecision={handleViewingDecision}
          onSelectContact={handleSelectInboxContact}
          onBackToContacts={handleBackToMessageContacts}
          onOpenListing={(listing) => {
            openListingDetail(listing);
          }}
        />
      ) : null}
      {activeSection === "Publish" ? (
        <PublishScreen
          isPublishing={isPublishing}
          token={token}
          listings={myListings}
          user={user}
          publishAccess={publishAccess}
          editingListingId={editingListingId}
          onEditListing={setEditingListingId}
          onSave={handleSaveListing}
        />
      ) : null}
      {activeSection === "Trips" ? (
        <TripsScreen
          viewingRequests={viewingRequests}
          user={user}
          onOpenDealRoom={() => navigateToSection("Messages")}
        />
      ) : null}
      {activeSection === "AdminRoommates" ? (
        <AdminRoommatesScreen
          token={token}
          user={user}
          stepUpSession={adminStepUpSession}
          onStepUpRequired={() => setAdminStepUpOpen(true)}
          onToast={setToast}
          onAuthenticationError={handleAdminAuthenticationError}
        />
      ) : null}
      {activeSection === "Trust" ? (
        <AdminTrustScreen
          token={token}
          user={user}
          stepUpSession={adminStepUpSession}
          onStepUpRequired={() => setAdminStepUpOpen(true)}
          trustMetrics={apiTrustQueues}
          onCatalogChanged={refreshPublicCatalog}
          onTrustMetricsChanged={refreshTrustMetrics}
          onToast={setToast}
          onAuthenticationError={(error) => {
            void handleAdminAuthenticationError(error);
          }}
        />
      ) : null}
      <StatusToast message={toast} />
    </main>
  );
}

function AppHeader({
  favoriteCount,
  messageUnreadCount,
  savedOnly,
  notifications,
  notificationsOpen,
  activeSection,
  onSectionChange,
  onSavedHomes,
  onNotifications,
  onNotificationOpen,
  onMarkAllNotifications,
  user,
  profile,
  onAuthOpen,
  onLogout
}: {
  favoriteCount: number;
  messageUnreadCount: number;
  savedOnly: boolean;
  notifications: LocalReminder[];
  notificationsOpen: boolean;
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  onSavedHomes: () => void;
  onNotifications: () => void;
  onNotificationOpen: (notification: LocalReminder) => void;
  onMarkAllNotifications: () => void;
  user: SessionUser | null;
  profile: ApiProfile | null;
  onAuthOpen: () => void;
  onLogout: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const primaryItems = navItems.slice(0, 4);
  const secondaryItems = navItems.slice(4);
  const visibleAdminItems = user?.role === "ADMIN" ? adminNavItems : [];
  const unreadCount = getUnreadNotificationCount(notifications);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/92 backdrop-blur-xl">
      <div className="app-shell grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 md:grid-cols-8 md:gap-5 xl:grid-cols-12 xl:gap-6">
        <div className="flex min-w-0 items-center gap-3 md:col-span-2 xl:col-span-3">
          <div className="flex size-11 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#006AFF,#0D4599)] text-white shadow-[0_16px_40px_rgba(0,106,255,0.28)]">
            <Home className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-lg font-black text-primary">Sublet Pipeline</div>
            <div className="hidden text-xs font-bold text-[#006AFF] xl:block">可信赖的短租与室友平台</div>
          </div>
        </div>

        <nav className="hidden min-w-0 items-center justify-center gap-1 md:col-span-5 md:flex xl:col-span-6 xl:gap-2">
          {primaryItems.map((item) => {
            const Icon = navIcons[item.section];

            return (
              <Button
                key={item.section}
                variant={
                  activeSection === item.section ||
                  (activeSection === "LikeQueue" && item.section === "Roommates")
                    ? "default"
                    : "ghost"
                }
                size="default"
                className="h-11 px-4 text-sm font-extrabold"
                onClick={() => onSectionChange(item.section)}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
                {item.section === "Messages" && messageUnreadCount > 0 ? (
                  <span className="flex min-w-5 items-center justify-center rounded-full bg-[#006AFF] px-1.5 text-[10px] font-black text-white">
                    {messageUnreadCount > 99 ? "99+" : messageUnreadCount}
                  </span>
                ) : null}
              </Button>
            );
          })}
        </nav>

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 md:col-span-1 xl:col-span-3">
          <Button variant={savedOnly ? "secondary" : "ghost"} size="icon" className="hidden rounded-full sm:inline-flex" aria-label="本机收藏" aria-pressed={savedOnly} onClick={onSavedHomes}>
            <Bookmark className={favoriteCount > 0 ? "fill-current text-primary" : undefined} />
          </Button>
          <Button variant={notificationsOpen ? "secondary" : "ghost"} size="icon" className="relative hidden rounded-full sm:inline-flex" aria-label="本机提醒" aria-expanded={notificationsOpen} onClick={onNotifications}>
            <Bell />
            {unreadCount > 0 ? <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-[#006AFF] text-[10px] font-black text-white">{unreadCount}</span> : null}
          </Button>
          <button
            type="button"
            className="hidden min-w-0 items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-2 text-sm font-bold text-primary shadow-sm transition-colors hover:bg-blue-50 lg:flex"
            onClick={onAuthOpen}
          >
            <ShieldCheck className="size-4 text-trust-green" aria-hidden="true" />
            <span className="max-w-[180px] truncate">
              {user ? profile?.displayName ?? user.email : "登录"}
            </span>
          </button>
          {user ? (
            <Button variant="ghost" size="sm" className="hidden rounded-full font-bold lg:inline-flex" onClick={onLogout}>
              退出
            </Button>
          ) : null}
          <Button variant="outline" size="icon" className="rounded-full md:hidden" onClick={onAuthOpen} aria-label="账户">
            <ShieldCheck />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden rounded-full font-bold lg:inline-flex"
            onClick={() => onSectionChange("Publish")}
          >
            <DoorOpen data-icon="inline-start" />
            房东发布
          </Button>
          <Button variant="outline" size="icon" className="rounded-full md:hidden" aria-label="打开菜单" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((current) => !current)}>
            <Menu />
          </Button>
        </div>
      </div>
      {visibleAdminItems.length > 0 ? (
        <div className="border-t border-blue-100 bg-blue-50/70">
          <nav aria-label="管理员工具" className="app-shell flex flex-wrap items-center gap-2 py-2">
            <span className="mr-1 text-xs font-black text-[#006AFF]">管理员工具</span>
            {visibleAdminItems.map((item) => {
              const Icon = navIcons[item.section];
              return (
                <Button
                  key={item.section}
                  type="button"
                  size="sm"
                  variant={activeSection === item.section ? "default" : "outline"}
                  aria-current={activeSection === item.section ? "page" : undefined}
                  onClick={() => onSectionChange(item.section)}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {item.label}
                </Button>
              );
            })}
          </nav>
        </div>
      ) : null}
      {notificationsOpen ? (
        <div className="absolute right-4 top-[68px] z-50 w-[min(360px,calc(100vw-2rem))] rounded-[24px] border border-blue-100 bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-extrabold text-primary">本机提醒</div>
              <div className="text-xs font-semibold text-muted-foreground">仅保存在此设备</div>
            </div>
            {unreadCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={onMarkAllNotifications}>全部已读</Button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2">
            {notifications.length > 0 ? notifications.slice(0, 6).map((notification) => (
              <button
                key={notification.id}
                className={cn("rounded-2xl p-3 text-left", notification.read ? "bg-slate-50" : "bg-blue-50")}
                type="button"
                onClick={() => onNotificationOpen(notification)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-primary">{notification.title}</div>
                  {!notification.read ? <span className="size-2 rounded-full bg-[#006AFF]" aria-label="未读" /> : null}
                </div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">{notification.detail}</div>
                <div className="mt-2 text-[11px] font-bold text-muted-foreground">{formatReminderTime(notification.createdAt)}</div>
              </button>
            )) : <div className="rounded-2xl border border-dashed p-4 text-sm font-semibold text-muted-foreground">暂无本机提醒。成功发送消息或看房请求后会显示在这里。</div>}
          </div>
        </div>
      ) : null}
      {mobileMenuOpen ? <div className="border-t border-blue-100 bg-white md:hidden">
        <div className="app-shell flex gap-1 overflow-x-auto py-2">
          {[...primaryItems, ...secondaryItems].map((item) => {
            const Icon = navIcons[item.section];

            return (
              <Button
                key={item.section}
                variant={activeSection === item.section || (activeSection === "LikeQueue" && item.section === "Roommates") ? "secondary" : "ghost"}
                size="sm"
                className="shrink-0"
                onClick={() => {
                  onSectionChange(item.section);
                  setMobileMenuOpen(false);
                }}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {item.label}
                {item.section === "Messages" && messageUnreadCount > 0 ? (
                  <span className="rounded-full bg-[#006AFF] px-1.5 text-[10px] font-black text-white">
                    {messageUnreadCount > 99 ? "99+" : messageUnreadCount}
                  </span>
                ) : null}
              </Button>
            );
          })}
          <Button variant={savedOnly ? "secondary" : "ghost"} size="sm" className="shrink-0" onClick={onSavedHomes}>
            <Bookmark className="size-3.5" aria-hidden="true" /> 收藏
          </Button>
          <Button variant={notificationsOpen ? "secondary" : "ghost"} size="sm" className="shrink-0" onClick={onNotifications}>
            <Bell className="size-3.5" aria-hidden="true" /> 提醒
          </Button>
        </div>
      </div> : null}
    </header>
  );
}

function formatReminderTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function RoommatesMarketplaceScreen({
  roommates,
  groupMembers,
  likedRoommateIds,
  likedMeRoommateIds,
  introSentRoommateIds,
  skippedCount,
  pendingRoommateIds,
  onLike,
  onLater,
  onPass,
  onSendIntro,
  onOpenDm,
  onDecideRoommate,
  onOpenDiscover,
  onOpenLikeQueue
}: {
  roommates: Roommate[];
  groupMembers: Roommate[];
  likedRoommateIds: Set<string>;
  likedMeRoommateIds: Set<string>;
  introSentRoommateIds: Set<string>;
  skippedCount: number;
  pendingRoommateIds: Set<string>;
  onLike: (roommate: Roommate) => Promise<boolean>;
  onLater: (roommate: Roommate) => Promise<boolean>;
  onPass: (roommate: Roommate) => Promise<boolean>;
  onSendIntro: (roommate: Roommate) => void;
  onOpenDm: (roommate: Roommate) => void;
  onDecideRoommate: (roommate: Roommate) => void;
  onOpenDiscover: () => void;
  onOpenLikeQueue: () => void;
}) {
  const [draftPreference, setDraftPreference] = useState<RoommatePreference>(defaultRoommatePreference);
  const [appliedPreference, setAppliedPreference] = useState<RoommatePreference>(defaultRoommatePreference);
  const [sortMode, setSortMode] = useState<"Preference" | "Budget">("Preference");
  const [deckIndex, setDeckIndex] = useState(0);
  const genderFilterAvailable = hasCompleteRoommateGenderData(roommates);
  const rankedRoommates = useMemo(
    () => rankRoommatesByPreference(roommates, appliedPreference),
    [appliedPreference, roommates]
  );
  const exactPreferenceMatches = useMemo(
    () => filterRoommatesByPreference(rankedRoommates, appliedPreference),
    [appliedPreference, rankedRoommates]
  );
  const displayRoommates = getRoommateDeckCandidates(exactPreferenceMatches);
  const sortedRoommates = useMemo(
    () =>
      sortMode === "Budget"
        ? [...displayRoommates].sort(
            (first, second) =>
              getRoommateBudgetValue(first) - getRoommateBudgetValue(second) ||
              second.preferenceFit.score - first.preferenceFit.score
          )
        : displayRoommates,
    [displayRoommates, sortMode]
  );
  const deckPosition = sortedRoommates.length > 0 ? deckIndex % sortedRoommates.length : 0;
  const activeDeckRoommate = sortedRoommates[deckPosition];
  const nextDeckRoommate =
    sortedRoommates.length > 1 ? sortedRoommates[(deckPosition + 1) % sortedRoommates.length] : undefined;
  const visibleRoommates = sortedRoommates.slice(0, 5);
  const roommateMemberIds = useMemo(() => new Set(groupMembers.map(getRoommateKey)), [groupMembers]);
  const connectionState = useMemo<RoommateConnectionState>(
    () => ({
      likedByMeIds: likedRoommateIds,
      likedMeIds: likedMeRoommateIds,
      introSentIds: introSentRoommateIds,
      roommateIds: roommateMemberIds
    }),
    [introSentRoommateIds, likedMeRoommateIds, likedRoommateIds, roommateMemberIds]
  );
  const reviewedCount = Math.min(roommates.length, likedRoommateIds.size + skippedCount);
  const activeRoommateKey = activeDeckRoommate ? getRoommateKey(activeDeckRoommate) : "";
  const activeConnectionStatus = activeDeckRoommate
    ? getRoommateConnectionStatus(activeRoommateKey, connectionState)
    : "new";

  useEffect(() => {
    setDeckIndex(0);
  }, [appliedPreference, sortMode]);

  function updatePreference(nextPreference: RoommatePreference) {
    setDraftPreference(nextPreference);
  }

  function goNextCard() {
    setDeckIndex((current) => current + 1);
  }

  async function handleLike(roommate: Roommate) {
    if (await onLike(roommate)) goNextCard();
  }

  async function handleLater(roommate: Roommate) {
    if (await onLater(roommate)) goNextCard();
  }

  async function handlePass(roommate: Roommate) {
    if (await onPass(roommate)) goNextCard();
  }

  function cycleGenderFilter() {
    if (!genderFilterAvailable) return;
    const currentIndex = roommateGenderOptions.indexOf(draftPreference.gender);
    const nextGender = roommateGenderOptions[(currentIndex + 1) % roommateGenderOptions.length];
    updatePreference({ ...draftPreference, gender: nextGender });
  }

  function cycleBudgetFilter() {
    const presets = [
      { budgetMin: 1200, budgetMax: 1800 },
      { budgetMin: 1500, budgetMax: 2200 },
      { budgetMin: 900, budgetMax: 1500 },
      { budgetMin: 0, budgetMax: 3000 }
    ];
    const currentIndex = presets.findIndex(
      (preset) => preset.budgetMin === draftPreference.budgetMin && preset.budgetMax === draftPreference.budgetMax
    );
    const nextPreset = presets[(currentIndex + 1) % presets.length];
    updatePreference({ ...draftPreference, ...nextPreset });
  }

  function cycleSchoolFilter() {
    const presets = [["UCLA"], ["USC"], ["Caltech"], ["LMU"], []] as const;
    const currentKey = draftPreference.schools.join(",");
    const currentIndex = presets.findIndex((preset) => preset.join(",") === currentKey);
    const nextSchools = presets[(currentIndex + 1) % presets.length];
    updatePreference({ ...draftPreference, schools: [...nextSchools] });
  }

  function cycleHobbyFilter() {
    const presets = [
      ["早睡", "健身", "安静"],
      ["会做饭", "爱干净"],
      ["轻社交", "宠物友好"],
      []
    ] as const;
    const currentKey = draftPreference.hobbies.join(",");
    const currentIndex = presets.findIndex((preset) => preset.join(",") === currentKey);
    const nextHobbies = presets[(currentIndex + 1) % presets.length];
    updatePreference({ ...draftPreference, hobbies: [...nextHobbies] });
  }

  return (
    <section className="app-shell relative flex w-full flex-col gap-6 overflow-hidden py-5 md:py-6">
      <RoommatePathGraphic className="hidden" />
      <RoommatePathGraphic className="hidden" />

      <Card className="overflow-hidden rounded-[18px] border-border bg-card shadow-panel">
        <CardContent className="p-4 md:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <span className="editorial-kicker">01 / 室友</span>
              <h1 className="text-display text-4xl font-black leading-tight text-primary md:text-6xl">
                室友匹配
              </h1>
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                {exactPreferenceMatches.length} 位符合 / 共 {roommates.length} 位认证 · 已浏览 {reviewedCount} 位 · 喜欢 {likedRoommateIds.size} 位
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="secondary" className="rounded-full font-bold" onClick={onOpenLikeQueue}>
                <Heart data-icon="inline-start" />
                喜欢列表 · {likedRoommateIds.size}
              </Button>
              <Button variant="outline" className="rounded-full font-bold" onClick={onOpenDiscover}>
                <Home data-icon="inline-start" />
                浏览房源
              </Button>
              <Button
                className="rounded-full bg-[#006AFF] font-bold text-white hover:bg-[#0D4599]"
                onClick={() => {
                  setAppliedPreference(
                    genderFilterAvailable
                      ? draftPreference
                      : { ...draftPreference, gender: "Open" }
                  );
                  setDeckIndex(0);
                }}
              >
                <SlidersHorizontal data-icon="inline-start" />
                应用偏好
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 overflow-hidden rounded-[18px] border border-border bg-card md:grid-cols-2 xl:grid-cols-4">
            <PreferenceSummaryField
              icon={Users}
              label="合租偏好"
              value={
                genderFilterAvailable
                  ? roommateGenderLabels[draftPreference.gender]
                  : "性别资料未提供"
              }
              disabled={!genderFilterAvailable}
              onClick={cycleGenderFilter}
            />
            <PreferenceSummaryField
              icon={DollarSign}
              label="预算"
              value={`$${draftPreference.budgetMin.toLocaleString()} - $${draftPreference.budgetMax.toLocaleString()}`}
              onClick={cycleBudgetFilter}
            />
            <PreferenceSummaryField
              icon={GraduationCap}
              label="学校"
              value={draftPreference.schools.join(", ") || "不限"}
              onClick={cycleSchoolFilter}
            />
            <PreferenceSummaryField
              icon={Sparkles}
              label="爱好"
              value={draftPreference.hobbies.slice(0, 3).join(", ") || "不限"}
              onClick={cycleHobbyFilter}
            />
          </div>
        </CardContent>
      </Card>

      <div className="app-grid relative z-10 items-start">
        <div className="col-span-full min-w-0 xl:col-span-4">
          <RoommatePreferencePanel
            preference={draftPreference}
            fitScore={activeDeckRoommate?.preferenceFit.score ?? 0}
            genderFilterAvailable={genderFilterAvailable}
            onPreferenceChange={updatePreference}
          />
        </div>

        <div className="col-span-full min-w-0 xl:col-span-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-extrabold text-primary">
                {activeDeckRoommate
                  ? `偏好匹配度 ${activeDeckRoommate.preferenceFit.score}%`
                  : "没有符合当前偏好的室友"}
              </div>
              <div className="text-sm font-semibold text-muted-foreground">
                {activeDeckRoommate
                  ? `第 ${deckPosition + 1} 位 / 共 ${sortedRoommates.length} 位`
                  : "调整左侧偏好并重新应用后再查看。"}
              </div>
            </div>
            <div className="flex w-fit overflow-hidden rounded-full border border-blue-200 bg-white p-1 shadow-sm">
              {(["Preference", "Budget"] as const).map((mode) => (
                <button
                  key={mode}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-extrabold transition-colors",
                    sortMode === mode ? "bg-[#006AFF] text-white" : "text-primary hover:bg-blue-50"
                  )}
                  type="button"
                  onClick={() => setSortMode(mode)}
                >
                  {mode === "Preference" ? "推荐" : "预算"}
                </button>
              ))}
            </div>
          </div>

          {activeDeckRoommate ? (
            <SwipeRoommateDeck
              roommate={activeDeckRoommate}
              nextRoommate={nextDeckRoommate}
              liked={likedRoommateIds.has(getRoommateKey(activeDeckRoommate))}
              connectionStatus={activeConnectionStatus}
              pending={pendingRoommateIds.has(`roommate:${activeRoommateKey}`)}
              onLike={() => handleLike(activeDeckRoommate)}
              onLater={() => handleLater(activeDeckRoommate)}
              onPass={() => handlePass(activeDeckRoommate)}
              onSendIntro={() => onSendIntro(activeDeckRoommate)}
              onOpenDm={() => onOpenDm(activeDeckRoommate)}
              onDecideRoommate={() => onDecideRoommate(activeDeckRoommate)}
            />
          ) : (
            <Card className="border-dashed p-8 text-center shadow-card">
              <CardTitle>暂无符合条件的室友</CardTitle>
              <CardDescription className="mt-2">
                当前不会回退显示未命中的人选，请调整预算、学校或其他偏好。
              </CardDescription>
            </Card>
          )}

          <PreferenceMatchRail
            roommates={visibleRoommates}
            likedRoommateIds={likedRoommateIds}
          />
        </div>

      </div>
    </section>
  );
}

function PreferenceSummaryField({
  icon: Icon,
  label,
  value,
  disabled = false,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-16 min-w-0 items-center gap-3 border-b border-blue-100 bg-white px-4 py-3 text-left transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 last:border-b-0 md:border-r md:last:border-r-0 xl:border-b-0"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="size-5 shrink-0 text-[#006AFF]" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-xs font-bold text-muted-foreground">{label}</div>
        <div className="mt-1 truncate text-sm font-extrabold text-primary">{value}</div>
      </div>
      <ChevronDown className="ml-auto size-4 shrink-0 text-[#006AFF]" aria-hidden="true" />
    </button>
  );
}

function RoommatePreferencePanel({
  preference,
  fitScore,
  genderFilterAvailable,
  onPreferenceChange
}: {
  preference: RoommatePreference;
  fitScore: number;
  genderFilterAvailable: boolean;
  onPreferenceChange: (preference: RoommatePreference) => void;
}) {
  function setBudget(field: "budgetMin" | "budgetMax", value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;

    onPreferenceChange({
      ...preference,
      [field]: field === "budgetMin"
        ? Math.min(numericValue, preference.budgetMax)
        : Math.max(numericValue, preference.budgetMin)
    });
  }

  function toggleSchool(school: string) {
    const selected = preference.schools.includes(school);
    onPreferenceChange({
      ...preference,
      schools: selected
        ? preference.schools.filter((item) => item !== school)
        : [...preference.schools, school]
    });
  }

  function toggleHobby(hobby: string) {
    const selected = preference.hobbies.includes(hobby);
    onPreferenceChange({
      ...preference,
      hobbies: selected
        ? preference.hobbies.filter((item) => item !== hobby)
        : [...preference.hobbies, hobby]
    });
  }

  return (
    <Card className="editorial-panel h-fit overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-display text-2xl font-black">我的偏好</CardTitle>
            <CardDescription className="font-semibold">调整合租筛选条件，应用后才会更新结果</CardDescription>
          </div>
          <div className="flex size-11 items-center justify-center rounded-full bg-blue-50 text-[#006AFF]">
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 rounded-[16px] border border-border bg-card p-4">
          <MatchScoreRing score={fitScore} label="匹配度" size="lg" />
          <div className="min-w-0">
            <div className="text-base font-black text-primary">
              {fitScore >= 90 ? "非常匹配" : fitScore >= 78 ? "比较匹配" : "建议调整偏好"}
            </div>
            <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
              编辑中的偏好不会立即改变结果，点击“应用偏好”后才会重新筛选和排序。
            </p>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">性别</div>
          {genderFilterAvailable ? (
            <div className="grid grid-cols-2 gap-2">
              {roommateGenderOptions.map((option) => (
                <PreferenceChip
                  key={option}
                  selected={preference.gender === option}
                  onClick={() => onPreferenceChange({ ...preference, gender: option })}
                >
                  {roommateGenderLabels[option]}
                </PreferenceChip>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-3 text-sm font-semibold text-muted-foreground">
              当前服务未提供可信性别资料，性别筛选暂不可用。
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">预算</span>
            <span className="text-xs font-bold text-[#006AFF]">
              ${preference.budgetMin.toLocaleString()} - ${preference.budgetMax.toLocaleString()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label="室友最低预算"
              className="h-11 rounded-2xl border-blue-100 text-sm font-bold"
              min={600}
              max={preference.budgetMax}
              onChange={(event) => setBudget("budgetMin", event.target.value)}
              type="number"
              value={preference.budgetMin}
            />
            <Input
              aria-label="室友最高预算"
              className="h-11 rounded-2xl border-blue-100 text-sm font-bold"
              min={preference.budgetMin}
              max={3000}
              onChange={(event) => setBudget("budgetMax", event.target.value)}
              type="number"
              value={preference.budgetMax}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">学校</div>
          <div className="flex flex-wrap gap-2">
            {roommateSchoolOptions.map((school) => (
              <PreferenceChip
                key={school}
                selected={preference.schools.includes(school)}
                onClick={() => toggleSchool(school)}
              >
                {school === "Other" ? "其他" : school}
              </PreferenceChip>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">爱好</div>
          <div className="flex flex-wrap gap-2">
            {roommateHobbyOptions.map((hobby) => (
              <PreferenceChip
                key={hobby}
                selected={preference.hobbies.includes(hobby)}
                onClick={() => toggleHobby(hobby)}
              >
                {hobby}
              </PreferenceChip>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PreferenceChip({
  selected,
  onClick,
  children
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "min-h-10 rounded-full border px-3 py-2 text-sm font-extrabold shadow-sm transition-all hover:-translate-y-0.5",
        selected
          ? "border-[#006AFF] bg-[#006AFF] text-white shadow-[0_10px_24px_rgba(0,106,255,0.18)]"
          : "border-blue-100 bg-white text-primary hover:bg-blue-50"
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MatchScoreRing({
  score,
  label,
  size = "md",
  inverted = false
}: {
  score: number;
  label: string;
  size?: "sm" | "md" | "lg";
  inverted?: boolean;
}) {
  const dimensions = size === "lg" ? "size-24" : size === "sm" ? "size-14" : "size-20";
  const valueSize = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-xl";
  const ringTrack = inverted ? "rgba(255,255,255,0.28)" : "rgba(219,234,254,1)";
  const ringColor = inverted ? "#ffffff" : "#006AFF";

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full",
        dimensions,
        inverted ? "text-white" : "text-primary"
      )}
      style={{
        background: `conic-gradient(${ringColor} ${score * 3.6}deg, ${ringTrack} 0deg)`
      }}
      aria-label={`${score}% ${label}`}
    >
      <div className={cn("absolute rounded-full", size === "lg" ? "inset-2" : "inset-1.5", inverted ? "bg-[#006AFF]" : "bg-white")} />
      <div className="relative text-center leading-none">
        <div className={cn("font-black", valueSize)}>{score}</div>
        <div className={cn("mt-1 font-bold", size === "sm" ? "text-[10px]" : "text-[11px]")}>{label}</div>
      </div>
    </div>
  );
}

function RoommatePathGraphic({ className }: { className?: string }) {
  return (
    <svg
      className={cn("pointer-events-none absolute h-72 w-72 text-[#006AFF]/25", className)}
      viewBox="0 0 260 260"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 30C48 10 58 70 95 58C138 44 104 146 158 132C207 119 196 205 250 196"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="10 12"
        strokeLinecap="round"
      />
      <circle cx="6" cy="30" r="5" fill="white" stroke="currentColor" strokeWidth="4" />
      <circle cx="158" cy="132" r="5" fill="white" stroke="currentColor" strokeWidth="4" />
      <path d="M226 207l15 33 15-33a17 17 0 10-30 0z" fill="#006AFF" opacity="0.95" />
      <circle cx="241" cy="205" r="5" fill="white" />
    </svg>
  );
}

function SwipeActionButton({
  icon: Icon,
  label,
  tone,
  onClick,
  disabled = false
}: {
  icon: LucideIcon;
  label: string;
  tone: "pass" | "later" | "like";
  onClick: () => void;
  disabled?: boolean;
}) {
  const toneClass = {
    pass: "border-red-100 bg-white text-trust-red hover:bg-red-50",
    later: "border-blue-100 bg-white text-[#006AFF] hover:bg-blue-50",
    like: "border-[#006AFF] bg-[#006AFF] text-white shadow-[0_18px_34px_rgba(0,106,255,0.28)] hover:bg-[#0D4599]"
  }[tone];

  return (
    <button className="group flex min-w-0 flex-col items-center gap-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-55" type="button" onClick={onClick} disabled={disabled}>
      <span
        className={cn(
          "grid size-16 place-items-center rounded-full border transition-all group-hover:-translate-y-1",
          toneClass
        )}
      >
        <Icon className={cn("size-7", tone === "like" && "fill-current")} aria-hidden="true" />
      </span>
      <span className={tone === "like" ? "text-[#006AFF]" : "text-primary"}>{label}</span>
    </button>
  );
}

function SwipeRoommateDeck({
  roommate,
  nextRoommate,
  liked,
  connectionStatus,
  pending,
  onLike,
  onLater,
  onPass,
  onSendIntro,
  onOpenDm,
  onDecideRoommate
}: {
  roommate: RankedRoommate<Roommate>;
  nextRoommate?: RankedRoommate<Roommate>;
  liked: boolean;
  connectionStatus: RoommateConnectionStatus;
  pending: boolean;
  onLike: () => void;
  onLater: () => void;
  onPass: () => void;
  onSendIntro: () => void;
  onOpenDm: () => void;
  onDecideRoommate: () => void;
}) {
  const reasons = roommate.preferenceFit.reasons.slice(0, 4);
  const gaps = roommate.preferenceFit.gaps.slice(0, 2);
  const canOpenDm = connectionStatus === "mutual" || connectionStatus === "roommate";
  if (!roommate.name) {
    return (
      <Card className="border-dashed p-8 text-center shadow-card">
        <CardTitle>暂无可显示的室友资料</CardTitle>
        <CardDescription className="mt-2">服务恢复后可继续筛选与匹配。</CardDescription>
      </Card>
    );
  }

  return (
    <div className="relative mx-auto min-h-[760px] w-full max-w-[660px]">
      {nextRoommate ? (
        <article className="absolute inset-x-8 top-8 h-[650px] rotate-2 overflow-hidden rounded-[36px] border border-blue-100 bg-white shadow-[0_26px_80px_rgba(15,23,42,0.10)]">
          <div className="h-full bg-cover bg-top opacity-35" style={{ backgroundImage: `url(${nextRoommate.image})` }} />
        </article>
      ) : null}

      <article className="relative overflow-hidden rounded-[36px] border border-blue-100 bg-white shadow-[0_30px_100px_rgba(0,106,255,0.18)]">
        <div className="relative h-[470px] bg-cover bg-top sm:h-[510px]" style={{ backgroundImage: `url(${roommate.image})` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/72 via-slate-950/8 to-transparent" />
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <Badge className="border-white/70 bg-white text-[#006AFF] shadow-sm">
            匹配度 {roommate.preferenceFit.score}%
            </Badge>
            <Badge className="border-white/20 bg-[#006AFF] text-white shadow-sm">
              已认证
            </Badge>
          </div>
          <Badge className="absolute right-4 top-4 border-white/25 bg-slate-950/45 text-white shadow-sm">
            {getRoommateStatusLabel(connectionStatus)}
          </Badge>
          <div className="absolute bottom-8 right-6 hidden sm:block">
            <MatchScoreRing score={roommate.preferenceFit.score} label="匹配" size="lg" inverted />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-display text-4xl font-black leading-none md:text-5xl">
                  {roommate.name}, {roommate.age}
                </h2>
                <p className="mt-2 text-sm font-bold text-white/88 md:text-base">{roommate.role}</p>
              </div>
              <div className="rounded-2xl border border-white/25 bg-white/14 px-4 py-3 text-right backdrop-blur">
                <div className="text-xs font-bold uppercase text-white/70">预算</div>
                <div className="text-lg font-extrabold">{roommate.budget}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ProfileMiniStat icon={Users} label="性别" value={getRoommateGenderLabel(roommate.gender)} />
            <ProfileMiniStat icon={GraduationCap} label="学校" value={roommate.school ?? "其他"} />
            <ProfileMiniStat icon={MapPin} label="区域" value={roommate.commute} />
          </div>

          <div>
            <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">匹配原因</div>
            <div className="flex flex-wrap gap-2">
              {reasons.map((reason) => (
                <span key={reason} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-[#006AFF]">
                  {reason}
                </span>
              ))}
              {gaps.map((gap) => (
                <span key={gap} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600">
                  {gap}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {roommate.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-primary">
                {tag}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-3 items-start gap-3 pt-1">
            <SwipeActionButton icon={X} label={pending ? "提交中" : "跳过"} tone="pass" onClick={onPass} disabled={pending} />
            <SwipeActionButton icon={Star} label={pending ? "提交中" : "稍后"} tone="later" onClick={onLater} disabled={pending} />
            <SwipeActionButton icon={Heart} label={pending ? "提交中" : liked ? "已喜欢" : "喜欢"} tone="like" onClick={onLike} disabled={pending} />
          </div>

          <div className="grid gap-2 rounded-[24px] border border-blue-100 bg-blue-50/70 p-3 sm:grid-cols-2">
            <Button variant="outline" className="rounded-full font-extrabold" onClick={canOpenDm ? onOpenDm : onSendIntro}>
              <MessageCircle data-icon="inline-start" />
              {canOpenDm ? "打开室友私信" : "室友私信 · 互相喜欢后开放"}
            </Button>
            <Button
              variant="secondary"
              className="rounded-full font-extrabold"
              onClick={onDecideRoommate}
            >
              <UserCheck data-icon="inline-start" />
              组队确认（暂未开放）
            </Button>
            <p className="text-xs font-semibold leading-5 text-muted-foreground sm:col-span-2">
              {getRoommateStatusDescription(connectionStatus)} {canOpenDm ? "服务端匹配已确认，可直接私信。" : "双方互相喜欢后会自动创建私信。"} 组队确认将在下一阶段开放。
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}

function getRoommateStatusLabel(status: RoommateConnectionStatus) {
  if (status === "roommate") return "已组成室友";
  if (status === "mutual") return "已互相匹配";
  if (status === "intro-sent") return "已发开场消息";
  if (status === "liked-you") return "对方喜欢了你";
  if (status === "liked-by-me") return "等待对方回应";
  return "新候选人";
}

function getRoommateStatusDescription(status: RoommateConnectionStatus) {
  if (status === "roommate") return "服务端已确认室友关系。";
  if (status === "mutual") return "服务端已确认互相匹配。";
  if (status === "intro-sent") return "旧版开场消息状态仅供提示，不会继续本地推进。";
  if (status === "liked-you") return "对方喜欢了你；喜欢回去后等待服务端确认匹配。";
  if (status === "liked-by-me") return "操作已提交，正在等待对方回应。";
  return "喜欢、跳过和稍后查看都会在服务端成功后才切换卡片。";
}

function getRoommateGenderLabel(gender?: string) {
  if (gender === "Woman" || gender === "Women") return "女性";
  if (gender === "Man" || gender === "Men") return "男性";
  if (gender === "Non-binary") return "非二元";
  return "未提供";
}

function ProfileMiniStat({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[22px] border border-blue-100 bg-[linear-gradient(180deg,#ffffff,#f6faff)] p-3 shadow-sm">
      <div className="mb-2 flex size-8 items-center justify-center rounded-full bg-blue-50 text-[#006AFF]">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="text-xs font-bold text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-extrabold text-primary">{value}</div>
    </div>
  );
}

function PreferenceMatchRail({
  roommates,
  likedRoommateIds
}: {
  roommates: Array<RankedRoommate<Roommate>>;
  likedRoommateIds: Set<string>;
}) {
  return (
    <div className="mt-5 rounded-[28px] border border-blue-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold text-primary">接下来的匹配</div>
          <div className="text-xs font-bold text-muted-foreground">按偏好匹配度排序</div>
        </div>
        <ChevronDown className="size-4 text-[#006AFF]" aria-hidden="true" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {roommates.map((roommate) => (
          <div key={getRoommateKey(roommate)} className="min-w-0 rounded-3xl border border-blue-100 bg-blue-50/50 p-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-11">
                <AvatarImage src={roommate.image} alt="" />
                <AvatarFallback>{roommate.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-primary">{roommate.name}</div>
                <div className="text-xs font-bold text-[#006AFF]">匹配度 {roommate.preferenceFit.score}%</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-bold text-muted-foreground">{roommate.school ?? "其他"}</span>
              {likedRoommateIds.has(getRoommateKey(roommate)) ? (
                <Heart className="size-4 fill-[#006AFF] text-[#006AFF]" aria-hidden="true" />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LikeQueueScreen({
  roommates,
  members,
  dealRooms,
  activeDealRoomId,
  likedRoommateIds,
  likedMeRoommateIds,
  introSentRoommateIds,
  tourRequested,
  onOpenRoommates,
  onOpenMessages,
  onOpenDm,
  onDecideRoommate,
  onSelectDealRoom,
  onRequestTour
}: {
  roommates: Roommate[];
  members: Roommate[];
  dealRooms: ApiDealRoom[];
  activeDealRoomId: string | null;
  likedRoommateIds: Set<string>;
  likedMeRoommateIds: Set<string>;
  introSentRoommateIds: Set<string>;
  tourRequested: boolean;
  onOpenRoommates: () => void;
  onOpenMessages: () => void;
  onOpenDm: (roommate: Roommate) => void;
  onDecideRoommate: (roommate: Roommate) => void;
  onSelectDealRoom: (dealRoomId: string) => void;
  onRequestTour: () => void;
}) {
  const memberIds = useMemo(() => new Set(members.map(getRoommateKey)), [members]);
  const connectionState = useMemo<RoommateConnectionState>(
    () => ({
      likedByMeIds: likedRoommateIds,
      likedMeIds: likedMeRoommateIds,
      introSentIds: introSentRoommateIds,
      roommateIds: memberIds
    }),
    [introSentRoommateIds, likedMeRoommateIds, likedRoommateIds, memberIds]
  );
  const queue = classifyRoommateQueue(roommates, getRoommateKey, {
    likedByMeIds: likedRoommateIds,
    likedMeIds: likedMeRoommateIds,
    roommateIds: memberIds
  });
  const waitingMembers = queue.waiting;
  const mutualMembers = queue.mutual;
  const totalBudget = members.reduce((sum, member) => sum + getRoommateBudgetValue(member), 0);
  const averageBudget = members.length > 0 ? Math.round(totalBudget / members.length) : 0;
  const ready = members.length > 0;

  return (
    <section className="app-shell flex w-full flex-col gap-5 py-5">
      <Card className="overflow-hidden rounded-[18px] border-border shadow-panel">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="editorial-kicker">01 / 喜欢列表</span>
            <div className="flex items-center gap-2">
              <Heart className="size-6 fill-[#006AFF] text-[#006AFF]" aria-hidden="true" />
              <h1 className="text-display text-3xl font-black text-primary">喜欢列表</h1>
            </div>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {waitingMembers.length} 位等待回应 · {mutualMembers.length} 位互相匹配 · {members.length} 位已组队
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full font-bold" onClick={onOpenRoommates}>
              <Users data-icon="inline-start" />
              返回匹配
            </Button>
            <Button className="rounded-full bg-[#006AFF] font-bold text-white hover:bg-[#0D4599]" onClick={onOpenMessages}>
              <MessageCircle data-icon="inline-start" />
              消息
            </Button>
          </div>
        </CardContent>
      </Card>

      {dealRooms.length > 1 ? (
        <Card className="rounded-[18px] border-blue-200 bg-blue-50/40 shadow-card">
          <CardContent className="p-4">
            <label className="grid gap-2 text-sm font-extrabold text-primary sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
              选择当前室友小组
              <select
                className="h-11 rounded-md border border-blue-200 bg-white px-3 text-sm font-bold"
                value={activeDealRoomId ?? ""}
                onChange={(event) => onSelectDealRoom(event.target.value)}
              >
                <option value="">请选择一个小组</option>
                {dealRooms.map((dealRoom) => (
                  <option key={dealRoom.id} value={dealRoom.id}>
                    {getDealRoomLabel(dealRoom)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              多个小组不会自动合并；消息和小组看房只使用你明确选中的小组。
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
        <QueueColumn title="等待对方回应" description="你已喜欢" count={waitingMembers.length}>
          {waitingMembers.length > 0 ? (
            waitingMembers.map((member) => (
              <RoommateConnectionRow
                key={getRoommateKey(member)}
                roommate={member}
                state={connectionState}
                onOpenDm={onOpenDm}
                onDecideRoommate={onDecideRoommate}
              />
            ))
          ) : (
            <QueueEmptyState>喜欢候选人后会显示在这里。</QueueEmptyState>
          )}
        </QueueColumn>

        <QueueColumn title="互相匹配" description="仅显示服务端确认的结果；可以直接私信" count={mutualMembers.length}>
          {mutualMembers.length > 0 ? (
            mutualMembers.map((member) => (
              <RoommateConnectionRow
                key={getRoommateKey(member)}
                roommate={member}
                state={connectionState}
                onOpenDm={onOpenDm}
                onDecideRoommate={onDecideRoommate}
              />
            ))
          ) : (
            <QueueEmptyState>服务端确认互相匹配后会显示在这里。</QueueEmptyState>
          )}
        </QueueColumn>

        <QueueColumn title="室友小组" description={ready ? `人均 $${averageBudget.toLocaleString()}` : "等待服务端确认室友关系"} count={members.length}>
          <div className="text-3xl font-extrabold text-primary">{ready ? `$${totalBudget.toLocaleString()} / 月` : "尚未组成"}</div>
          {members.length > 0 ? (
            members.map((member) => (
              <div key={getRoommateKey(member)} className="flex items-center gap-3 rounded-[22px] border border-blue-100 bg-white p-3">
                <Avatar className="size-11">
                  <AvatarImage src={member.image} alt="" />
                  <AvatarFallback>{member.name.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold text-primary">{member.name}</div>
                  <div className="truncate text-xs font-semibold text-muted-foreground">{member.role}</div>
                </div>
                <UserCheck className="size-5 text-[#006AFF]" aria-hidden="true" />
              </div>
            ))
          ) : (
            <QueueEmptyState>还没有服务端确认的室友小组。</QueueEmptyState>
          )}
          <Button className="mt-auto h-11 rounded-full bg-[#006AFF] font-extrabold text-white hover:bg-[#0D4599]" disabled={!ready} onClick={onRequestTour}>
            <CalendarDays data-icon="inline-start" />
            {tourRequested && ready ? "小组看房已请求" : "发起小组看房"}
          </Button>
        </QueueColumn>
      </div>
    </section>
  );
}

function QueueColumn({
  title,
  description,
  count,
  children
}: {
  title: string;
  description: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Card className="min-h-[520px] rounded-[18px] border-border bg-card shadow-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant={count > 0 ? "trust" : "secondary"}>{count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex h-[420px] flex-col gap-3 overflow-y-auto app-scrollbar">{children}</CardContent>
    </Card>
  );
}

function QueueEmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-[22px] border border-dashed border-blue-200 bg-white p-4 text-sm font-semibold text-muted-foreground">{children}</div>;
}

function RoommateConnectionRow({
  roommate,
  state,
  onOpenDm,
  onDecideRoommate
}: {
  roommate: Roommate;
  state: RoommateConnectionState;
  onOpenDm: (roommate: Roommate) => void;
  onDecideRoommate: (roommate: Roommate) => void;
}) {
  const key = getRoommateKey(roommate);
  const status = getRoommateConnectionStatus(key, state);

  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 rounded-[24px] border border-blue-100 bg-white p-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-12 ring-2 ring-blue-100">
          <AvatarImage src={roommate.image} alt="" />
          <AvatarFallback>{roommate.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-primary">{roommate.name}</div>
          <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">{getRoommateStatusLabel(status)}</div>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="icon" variant="secondary" className="size-9 rounded-full" onClick={() => onOpenDm(roommate)}>
          <MessageCircle className="size-4" aria-hidden="true" />
          <span className="sr-only">打开室友私信</span>
        </Button>
        <Button size="icon" variant="secondary" className="size-9 rounded-full" onClick={() => onDecideRoommate(roommate)}>
          <UserCheck className="size-4" aria-hidden="true" />
          <span className="sr-only">组队确认暂未开放</span>
        </Button>
      </div>
    </div>
  );
}

function DiscoverScreen({
  filters,
  listings,
  totalListingCount,
  page,
  pageCount,
  heading,
  summary,
  previewDataEnabled,
  serviceUnavailable,
  selectedListing,
  favoriteIds,
  viewMode,
  listingActionLabel,
  onFiltersChange,
  onAmenityChange,
  onClear,
  onPreview,
  onOpenListing,
  onFavorite,
  onViewModeChange,
  onOpenRoommates,
  onPageChange
}: {
  filters: SearchFilters;
  listings: Listing[];
  totalListingCount: number;
  page: number;
  pageCount: number;
  heading: string;
  summary: string;
  previewDataEnabled: boolean;
  serviceUnavailable: boolean;
  selectedListing: Listing;
  favoriteIds: Set<string>;
  viewMode: ViewMode;
  listingActionLabel: string;
  onFiltersChange: (filters: SearchFilters) => void;
  onAmenityChange: (value: string) => void;
  onClear: () => void;
  onPreview: (listing: Listing) => void;
  onOpenListing: (listing: Listing) => void;
  onFavorite: (id: string) => void;
  onViewModeChange: (value: ViewMode) => void;
  onOpenRoommates: () => void;
  onPageChange: (page: number) => void;
}) {
  function handleMapSelect(listing: Listing) {
    onPreview(listing);
    window.requestAnimationFrame(() => {
      document.getElementById(getListingCardDomId(listing.id))?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
      });
    });
  }

  return (
    <section className="app-shell flex w-full flex-col gap-6 py-5 md:py-6">
      <SearchHero
        filters={filters}
        resultCount={totalListingCount}
        previewDataEnabled={previewDataEnabled}
        onFiltersChange={onFiltersChange}
        onAmenityChange={onAmenityChange}
        onClear={onClear}
      />

      <div className="app-grid items-start">
        <div className={cn("col-span-full flex min-w-0 flex-col gap-4", viewMode === "map" && "lg:col-span-4 xl:col-span-7")}>
          <MarketToolbar
            listingCount={listings.length}
            heading={heading}
            summary={summary}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            favoriteCount={favoriteIds.size}
            dateRangeLabel={formatDateRangeLabel(filters)}
            onOpenRoommates={onOpenRoommates}
          />
          {serviceUnavailable ? (
            <Card className="border-dashed shadow-card">
              <CardHeader>
                <CardTitle>房源服务暂时不可用</CardTitle>
                <CardDescription>当前没有使用假房源回退，请稍后刷新重试。</CardDescription>
              </CardHeader>
            </Card>
          ) : listings.length === 0 ? (
            <EmptyResults filters={filters} onClear={onClear} />
          ) : (
            <ListingGrid
              listings={listings}
              selectedId={selectedListing.id}
              favoriteIds={favoriteIds}
              onPreview={onPreview}
              onOpenListing={onOpenListing}
              onFavorite={onFavorite}
              actionLabel={listingActionLabel}
            />
          )}
          {totalListingCount > 0 ? (
            <nav className="flex items-center justify-between rounded-[18px] border bg-white p-3" aria-label="房源分页">
              <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button>
              <span className="text-sm font-bold text-muted-foreground">第 {page} / {pageCount} 页</span>
              <Button variant="outline" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</Button>
            </nav>
          ) : null}
        </div>

        {viewMode === "map" ? (
          <aside className="col-span-full hidden min-w-0 lg:col-span-4 lg:block xl:col-span-5">
            <MapCanvas
              className="sticky top-[var(--app-header-offset)]"
              listings={listings}
              totalResultCount={totalListingCount}
              selectedListing={selectedListing}
              onSelect={handleMapSelect}
            />
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function SearchHero({
  filters,
  resultCount,
  previewDataEnabled,
  onFiltersChange,
  onAmenityChange,
  onClear
}: {
  filters: SearchFilters;
  resultCount: number;
  previewDataEnabled: boolean;
  onFiltersChange: (filters: SearchFilters) => void;
  onAmenityChange: (value: string) => void;
  onClear: () => void;
}) {
  const insight = buildSearchInsight(filters, resultCount);
  const normalizedPrice = normalizePriceRange(filters);

  function updatePrice(nextPrice: Partial<Pick<SearchFilters, "priceMin" | "priceMax">>) {
    onFiltersChange({
      ...filters,
      page: 1,
      ...normalizePriceRange({
        priceMin: nextPrice.priceMin ?? filters.priceMin,
        priceMax: nextPrice.priceMax ?? filters.priceMax
      })
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="rounded-[18px] border-border bg-card shadow-panel">
        <CardContent className="grid grid-cols-4 gap-4 p-4 md:grid-cols-8 md:gap-5 md:p-5 xl:grid-cols-12 xl:items-end xl:gap-6 xl:p-6">
          <div className="col-span-4 min-w-0 md:col-span-8 xl:col-span-3">
            <span className="editorial-kicker">01 / 短租</span>
            <h2 className="mt-2 text-2xl font-black leading-tight tracking-[-0.035em] text-foreground">
              查找适合你的短租
            </h2>
            {previewDataEnabled ? <Badge className="mt-2" variant="warning">开发预览数据</Badge> : null}
          </div>
          <label className="editorial-field col-span-4 xl:col-span-3">
            目的地
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-12 pl-10 text-base font-bold"
                value={filters.query}
                onChange={(event) =>
                  onFiltersChange({ ...filters, query: event.target.value, page: 1 })
                }
                placeholder="学校、公司、街区"
              />
            </div>
          </label>
          <div className="col-span-4 xl:col-span-3">
            <DateRangePicker
              range={filters}
              onChange={(range) => onFiltersChange({ ...filters, ...range, page: 1 })}
            />
          </div>
          <div className="editorial-field col-span-4 md:col-span-4 xl:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <span>价格区间</span>
              <span className="text-xs font-black text-[#006AFF]">{formatPriceRangeLabel(filters)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="最低价格"
                className="h-10 text-sm font-bold"
                min={priceFilterBounds.min}
                max={normalizedPrice.priceMax}
                step={50}
                type="number"
                value={normalizedPrice.priceMin}
                onChange={(event) => updatePrice({ priceMin: Number(event.target.value) })}
              />
              <Input
                aria-label="最高价格"
                className="h-10 text-sm font-bold"
                min={normalizedPrice.priceMin}
                max={priceFilterBounds.max}
                step={50}
                type="number"
                value={normalizedPrice.priceMax}
                onChange={(event) => updatePrice({ priceMax: Number(event.target.value) })}
              />
            </div>
            <input
              aria-label="最高价格滑杆"
              className="h-6 w-full accent-[#006AFF]"
              type="range"
              min={priceFilterBounds.min}
              max={priceFilterBounds.max}
              step="50"
              value={normalizedPrice.priceMax}
              onChange={(event) => updatePrice({ priceMax: Number(event.target.value) })}
            />
          </div>
          <Button variant="trust" className="col-span-4 h-12 px-5 font-black md:col-span-4 xl:col-span-1" onClick={onClear}>
            重置
          </Button>
        </CardContent>
      </Card>

      <div className="editorial-context-strip">
        <div className="col-span-full flex flex-wrap gap-2 xl:col-span-7">
            {pricePresets.map((preset) => {
              const active =
                normalizedPrice.priceMin === preset.priceMin &&
                normalizedPrice.priceMax === preset.priceMax;

              return (
                <button
                  key={preset.label}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-extrabold shadow-sm transition-all hover:-translate-y-0.5",
                    active
                      ? "border-[#006AFF] bg-[#006AFF] text-white"
                      : "border-border bg-white text-muted-foreground hover:bg-secondary"
                  )}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updatePrice({ priceMin: preset.priceMin, priceMax: preset.priceMax })}
                >
                  <DollarSign className="size-4" aria-hidden="true" />
                  {preset.label}
                </button>
              );
            })}
            {amenities.map((amenity) => {
              const Icon = amenity.icon;
              const active = amenity.label === filters.amenity;

              return (
                <button
                  key={amenity.label}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-extrabold shadow-sm transition-all hover:-translate-y-0.5",
                    active
                      ? "border-[#006AFF] bg-[#006AFF] text-white"
                      : "border-border bg-white text-muted-foreground hover:bg-secondary"
                  )}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onAmenityChange(amenity.label)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {amenity.label}
                </button>
              );
            })}
        </div>
        <div className="col-span-full text-sm font-semibold text-muted-foreground md:col-span-3 xl:col-span-2">
            当前命中 <span className="text-primary">{resultCount}</span> 套房源
            <label className="mt-2 grid gap-1 text-xs font-bold">
              排序
              <select
                className="h-9 rounded-md border bg-white px-2 text-sm text-primary"
                value={filters.sort}
                onChange={(event) => onFiltersChange({ ...filters, sort: event.target.value as CatalogSort, page: 1 })}
              >
                <option value="recommended">推荐</option>
                <option value="price-low">价格从低到高</option>
                <option value="price-high">价格从高到低</option>
                <option value="rating">评分最高</option>
              </select>
            </label>
        </div>

        <div
          className={cn(
            "col-span-full grid min-w-0 grid-cols-1 gap-3 md:col-span-5 xl:col-span-3",
            insight.status === "healthy" && "border-emerald-100 bg-emerald-50/70",
            insight.status === "tight" && "border-trust-amber/25 bg-trust-amber/5",
            insight.status === "empty" && "border-trust-red/20 bg-trust-red/5"
          )}
        >
          <div className="flex items-center gap-2">
            <Sparkles
              className={cn(
                "size-4",
                insight.status === "healthy" && "text-trust-green",
                insight.status === "tight" && "text-trust-amber",
                insight.status === "empty" && "text-trust-red"
              )}
              aria-hidden="true"
            />
            <span className="text-sm font-extrabold text-primary">{insight.headline}</span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {insight.chips.map((chip) => (
              <Badge key={chip} variant="secondary" className="max-w-full truncate">
                {chip}
              </Badge>
            ))}
          </div>
          <p className="text-sm font-semibold text-muted-foreground">{insight.suggestion}</p>
        </div>
      </div>
    </div>
  );
}

function DateRangePicker({
  range,
  onChange
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeField, setActiveField] = useState<"checkIn" | "checkOut">("checkIn");
  const [visibleMonth, setVisibleMonth] = useState(range.checkIn || "2026-08-01");
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const months = useMemo(() => buildCalendarMonths(visibleMonth, 2), [visibleMonth]);
  const days = countNights(range);
  const flexibleStays = [
    { label: "一个月", days: 30 },
    { label: "三个月", days: 90 },
    { label: "半年", days: 180 }
  ];

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function toggleDialog(field: "checkIn" | "checkOut", trigger: HTMLButtonElement) {
    lastTriggerRef.current = trigger;
    setActiveField(field);
    setVisibleMonth(range.checkIn || "2026-08-01");
    setOpen((current) => !current || activeField !== field);
  }

  function closeDialog() {
    setOpen(false);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }

  function moveVisibleMonth(offset: number) {
    const [year, month] = visibleMonth.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1));
    setVisibleMonth(next.toISOString().slice(0, 10));
  }

  function handleDateClick(isoDate: string) {
    const nextRange =
      activeField === "checkOut" && range.checkIn && compareIsoDates(isoDate, range.checkIn) > 0
        ? { ...range, checkOut: isoDate }
        : selectDateRange(range, isoDate);

    onChange(nextRange);
    setActiveField(nextRange.checkOut ? "checkIn" : "checkOut");
  }

  return (
    <div className="relative flex flex-col gap-2 text-sm font-semibold">
      日期
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={activeField === "checkIn" && open ? "secondary" : "outline"}
          className="h-11 justify-start"
          aria-haspopup="dialog"
          aria-expanded={open && activeField === "checkIn"}
          onClick={(event) => toggleDialog("checkIn", event.currentTarget)}
        >
          <CalendarDays data-icon="inline-start" />
          {range.checkIn ? formatShortDate(range.checkIn) : "入住"}
        </Button>
        <Button
          variant={activeField === "checkOut" && open ? "secondary" : "outline"}
          className="h-11 justify-start"
          aria-haspopup="dialog"
          aria-expanded={open && activeField === "checkOut"}
          onClick={(event) => toggleDialog("checkOut", event.currentTarget)}
        >
          <CalendarDays data-icon="inline-start" />
          {range.checkOut ? formatShortDate(range.checkOut) : "退租"}
        </Button>
      </div>
      {mounted && open ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-3" onMouseDown={closeDialog}>
        <div
          className="max-h-[calc(100vh-1.5rem)] w-full max-w-[760px] overflow-y-auto rounded-[24px] border bg-white p-4 shadow-panel sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="选择入住和退租日期"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-base font-extrabold text-primary">{formatDateRangeLabel(range)}</div>
              <div className="text-xs font-semibold text-muted-foreground">
                {days > 0 ? "先选入住，再选退租；结果会自动更新。" : "请选择入住和退租日期。"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {flexibleStays.map((stay) => (
                <Button
                  key={stay.label}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onChange(applyFlexibleStay(range, stay.days));
                    setActiveField("checkIn");
                  }}
                >
                  {stay.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="icon" aria-label="上个月" onClick={() => moveVisibleMonth(-1)}>
              <ArrowLeft />
            </Button>
            <span className="text-xs font-bold text-muted-foreground">桌面显示两个月，窄屏显示一个月</span>
            <Button variant="outline" size="icon" aria-label="下个月" onClick={() => moveVisibleMonth(1)}>
              <ArrowRight />
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {months.map((month, monthIndex) => (
              <div key={month.key} className={cn("min-w-0", monthIndex === 1 && "hidden sm:block")}>
                <div className="text-sm font-extrabold text-primary">{month.label}</div>
                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground">
                  {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {month.days.map((day) => {
                    const isStart = day.iso === range.checkIn;
                    const isEnd = day.iso === range.checkOut;
                    const inRange =
                      range.checkIn &&
                      range.checkOut &&
                      compareIsoDates(day.iso, range.checkIn) > 0 &&
                      compareIsoDates(day.iso, range.checkOut) < 0;

                    return (
                      <button
                        key={day.iso}
                        className={cn(
                          "flex aspect-square min-h-9 items-center justify-center rounded-md text-sm font-bold transition-colors",
                          !day.inCurrentMonth && "text-muted-foreground/45",
                          inRange && "bg-trust-sky/10 text-primary",
                          (isStart || isEnd) && "bg-primary text-white",
                          day.inCurrentMonth && !isStart && !isEnd && "hover:bg-secondary"
                        )}
                        type="button"
                        onClick={() => handleDateClick(day.iso)}
                        aria-label={`${day.iso}${isStart ? " 入住" : isEnd ? " 退租" : ""}`}
                      >
                        {day.day}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="trust" size="sm" onClick={closeDialog}>
              完成
            </Button>
          </div>
        </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function MessagesScreen({
  contacts,
  activeContact,
  selectedListing,
  selectedRoommateConversation,
  roommateMessages,
  roommateNextCursor,
  roommateHistoryLoading,
  roommateHistoryError,
  dealStage,
  dealThread,
  latestViewingRequest,
  narrowPane,
  viewingSlots,
  pendingActions,
  onSendMessage,
  onSendRoommateMessage,
  onRetryRoommateMessage,
  onLoadOlderRoommateMessages,
  onRequestTour,
  onViewingDecision,
  onSelectContact,
  onBackToContacts,
  onOpenListing
}: {
  contacts: InboxContact[];
  activeContact: InboxContact | null;
  selectedListing: Listing | null;
  selectedRoommateConversation: ApiRoommateConversation | null;
  roommateMessages: RoommateMessageView[];
  roommateNextCursor: string | null;
  roommateHistoryLoading: boolean;
  roommateHistoryError: string | null;
  dealStage: string;
  dealThread: DealThread | null;
  latestViewingRequest: ViewingRequest | null;
  narrowPane: "contacts" | "conversation";
  viewingSlots: ViewingSlot[];
  pendingActions: Set<string>;
  onSendMessage: (listing: Listing, body: string) => Promise<boolean>;
  onSendRoommateMessage: (conversation: ApiRoommateConversation, body: string) => boolean;
  onRetryRoommateMessage: (message: RoommateMessageView) => void;
  onLoadOlderRoommateMessages: (conversationId: string) => void;
  onRequestTour: (listing: Listing, slot?: ViewingSlot) => Promise<boolean>;
  onViewingDecision: (
    listing: Listing,
    request: ViewingRequest,
    decision: "confirm" | "decline"
  ) => Promise<boolean>;
  onSelectContact: (contact: InboxContact) => void;
  onBackToContacts: () => void;
  onOpenListing: (listing: Listing) => void;
}) {
  return (
    <section className="app-shell app-grid min-h-[calc(100vh-76px)] w-full py-4 md:py-5">
      <aside className={cn("col-span-full min-w-0 lg:col-span-3 xl:col-span-3", narrowPane === "conversation" && "hidden lg:block")}>
        <Card className="h-full min-h-[640px] overflow-hidden shadow-panel">
          <CardHeader>
            <span className="editorial-kicker">01 / 消息</span>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>消息</CardTitle>
                <CardDescription>房东与室友会话统一显示，记录以服务端为准</CardDescription>
              </div>
              <Badge variant={contacts.length > 0 ? "trust" : "secondary"}>{contacts.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex max-h-[calc(100vh-190px)] flex-col gap-2 overflow-y-auto app-scrollbar">
            {contacts.length > 0 ? (
              contacts.map((contact) => {
                const selected = activeContact ? getInboxContactKey(activeContact) === getInboxContactKey(contact) : false;

                return (
                  <button
                    key={getInboxContactKey(contact)}
                    className={cn(
                      "grid grid-cols-[52px_minmax(0,1fr)] gap-3 rounded-[22px] border p-3 text-left transition-all hover:bg-blue-50",
                      selected ? "border-[#006AFF] bg-blue-50 shadow-sm" : "border-blue-100 bg-white"
                    )}
                    type="button"
                    onClick={() => onSelectContact(contact)}
                  >
                    <Avatar className="size-12">
                      <AvatarImage src={contact.image} alt="" />
                      <AvatarFallback>{contact.contactName.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-extrabold text-primary">{contact.contactName}</div>
                        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-black text-muted-foreground">
                          {contact.time}
                          {contact.unreadCount && contact.unreadCount > 0 ? (
                            <span className="flex min-w-5 items-center justify-center rounded-full bg-[#006AFF] px-1.5 py-0.5 text-white">
                              {contact.unreadCount > 99 ? "99+" : contact.unreadCount}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant={contact.kind === "roommate" ? "trust" : "secondary"} className="shrink-0">
                          {contact.kind === "roommate" ? "室友" : "房东"}
                        </Badge>
                        <span className="truncate text-xs font-bold text-muted-foreground">{contact.contextLabel}</span>
                      </div>
                      <div className="mt-2 truncate text-xs font-semibold text-muted-foreground">{contact.preview}</div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/50 p-4 text-sm font-semibold text-muted-foreground">
                还没有联系人。联系房东或与真实用户互相喜欢后，会话会出现在这里。
              </div>
            )}
          </CardContent>
        </Card>
      </aside>

      <div className={cn("col-span-full min-w-0 flex-col gap-4 lg:col-span-5 xl:col-span-9", narrowPane === "conversation" ? "flex" : "hidden lg:flex")}>
        <div className="editorial-toolbar">
          <span className="editorial-kicker">01 / 消息</span>
        </div>
        {narrowPane === "conversation" ? (
          <Button variant="outline" className="w-fit lg:hidden" onClick={onBackToContacts}>
            <ArrowLeft data-icon="inline-start" />
            返回联系人
          </Button>
        ) : null}
        {activeContact?.kind === "listing" && selectedListing && dealThread ? (
          <>
            <Card className="overflow-hidden shadow-panel">
              <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                <div className="min-h-40 bg-cover bg-center" style={{ backgroundImage: `url(${selectedListing.image})` }} />
                <CardContent className="flex min-w-0 flex-col justify-center gap-2 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="trust">{getHostContactName(selectedListing)}</Badge>
                    <Badge variant={latestViewingRequest ? "success" : "secondary"}>{dealStage}</Badge>
                  </div>
                  <div className="truncate text-xl font-extrabold text-primary">{selectedListing.title}</div>
                  <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-muted-foreground">
                    <span>{selectedListing.area}</span>
                    <span>${selectedListing.price.toLocaleString()}/月</span>
                    <span>{selectedListing.beds} 间卧室 · {selectedListing.baths} 间卫浴</span>
                  </div>
                </CardContent>
                <div className="flex items-center p-4 md:justify-end">
                  <Button variant="outline" className="w-full md:w-auto" onClick={() => onOpenListing(selectedListing)}>
                    查看房源
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </div>
              </div>
            </Card>
            <DealCommunicationPanel
              listing={selectedListing}
              thread={dealThread}
              stage={dealStage}
              viewingSlots={viewingSlots}
              latestViewingRequest={latestViewingRequest}
              messagePending={pendingActions.has(`message:${selectedListing.id}`)}
              tourPending={pendingActions.has(`tour:${selectedListing.id}`)}
              decisionPending={
                latestViewingRequest
                  ? pendingActions.has(`viewing-decision:${latestViewingRequest.id}`)
                  : false
              }
              onSendMessage={onSendMessage}
              onRequestTour={onRequestTour}
              onViewingDecision={onViewingDecision}
            />
          </>
        ) : activeContact?.kind === "roommate" && selectedRoommateConversation ? (
          <RoommateConversationPanel
            key={selectedRoommateConversation.id}
            conversation={selectedRoommateConversation}
            messages={roommateMessages}
            nextCursor={roommateNextCursor}
            loading={roommateHistoryLoading}
            error={roommateHistoryError}
            onLoadOlder={onLoadOlderRoommateMessages}
            onSend={onSendRoommateMessage}
            onRetry={onRetryRoommateMessage}
          />
        ) : (
          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle>选择联系人</CardTitle>
              <CardDescription>从左侧选择房东或室友，右侧会打开对应消息。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-[24px] border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center text-sm font-semibold text-muted-foreground">
                联系房东或完成双向室友匹配后，会话会在服务端创建并显示在这里。
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function RoommateConversationPanel({
  conversation,
  messages,
  nextCursor,
  loading,
  error,
  onLoadOlder,
  onSend,
  onRetry
}: {
  conversation: ApiRoommateConversation;
  messages: RoommateMessageView[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  onLoadOlder: (conversationId: string) => void;
  onSend: (conversation: ApiRoommateConversation, body: string) => boolean;
  onRetry: (message: RoommateMessageView) => void;
}) {
  const [draft, setDraft] = useState("");
  const latestSelfMessage = [...messages]
    .reverse()
    .find((message) => message.senderRole === "self");
  const quickReplies = ["你计划什么时候入住？", "预算和通勤范围方便对一下吗？", "周末一起去看房吗？"];

  function submitMessage() {
    const accepted = onSend(conversation, draft);
    if (accepted) setDraft("");
  }

  return (
    <Card className="overflow-hidden shadow-panel" data-testid="roommate-dm-panel">
      <CardHeader className="border-b border-blue-100 bg-blue-50/40">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-12">
              <AvatarImage src={conversation.peer.image ?? ""} alt="" />
              <AvatarFallback>{(conversation.peer.name ?? "室").slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="truncate">{conversation.peer.name ?? "室友"}</CardTitle>
              <CardDescription className="truncate">
                {conversation.peer.role ?? "已完成双向室友匹配"}
              </CardDescription>
            </div>
          </div>
          <Badge variant={conversation.writable ? "trust" : "secondary"}>
            {conversation.writable ? "可以发送" : "只读"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        {nextCursor ? (
          <Button
            variant="outline"
            size="sm"
            className="mx-auto"
            disabled={loading}
            onClick={() => onLoadOlder(conversation.id)}
          >
            {loading ? "正在加载" : "加载更早消息"}
          </Button>
        ) : null}
        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => onLoadOlder(conversation.id)}>
              重试加载
            </Button>
          </div>
        ) : null}

        <div className="flex max-h-[430px] min-h-[260px] flex-col gap-3 overflow-y-auto rounded-[24px] border bg-blue-50/40 p-3 app-scrollbar">
          {loading && messages.length === 0 ? (
            <div className="m-auto text-sm font-semibold text-muted-foreground">正在加载消息…</div>
          ) : messages.length === 0 ? (
            <div className="m-auto max-w-md rounded-[20px] border border-dashed bg-white p-5 text-center text-sm font-semibold text-muted-foreground">
              你们已经互相喜欢。可以从入住时间、预算和生活习惯开始聊起。
            </div>
          ) : null}
          {messages.map((message) => {
            const isSelf = message.senderRole === "self";
            const showDelivery =
              isSelf &&
              (message.deliveryStatus === "failed" || latestSelfMessage?.id === message.id);
            const deliveryLabel = showDelivery
              ? getRoommateDeliveryLabel(message, conversation)
              : null;

            return (
              <div
                key={message.id}
                className={cn(
                  "max-w-[88%] rounded-[22px] border px-3 py-2 text-sm shadow-sm",
                  isSelf
                    ? "ml-auto border-[#006AFF]/20 bg-[#006AFF] text-white"
                    : "border-blue-100 bg-white text-primary"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 text-[11px] font-black",
                    isSelf ? "text-white/80" : "text-muted-foreground"
                  )}
                >
                  <span>{isSelf ? "我" : conversation.peer.name ?? "室友"}</span>
                  <span>{formatApiMessageTime(message.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap font-semibold leading-5">{message.body}</p>
                {deliveryLabel ? (
                  <div className="mt-2 flex items-center justify-end gap-2 text-[11px] font-black text-white/85">
                    <span>{deliveryLabel}</span>
                    {message.deliveryStatus === "failed" ? (
                      <button
                        type="button"
                        className="rounded-full bg-white/15 px-2 py-1 text-white underline"
                        onClick={() => onRetry(message)}
                      >
                        重新发送
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {conversation.writable ? (
          <>
            <div className="flex flex-wrap gap-2">
              {quickReplies.map((reply) => (
                <Button
                  key={reply}
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setDraft(reply)}
                >
                  {reply}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_56px] items-stretch gap-2">
              <div className="min-w-0">
                <textarea
                  className="min-h-20 w-full resize-none rounded-[22px] border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-primary shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-[#006AFF]"
                  value={draft}
                  maxLength={2000}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="输入给室友的消息"
                />
                <div className="mt-1 text-right text-[11px] font-bold text-muted-foreground">
                  {draft.length}/2,000
                </div>
              </div>
              <Button
                className="h-20 rounded-[22px] bg-[#006AFF] px-4 text-white hover:bg-[#0D4599]"
                disabled={!draft.trim() || draft.trim().length > 2000}
                onClick={submitMessage}
              >
                <Send aria-hidden="true" />
                <span className="sr-only">发送消息</span>
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-[20px] border border-dashed border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-muted-foreground">
            这段室友匹配已结束。历史消息仍可查看，但不能继续发送。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getRoommateDeliveryLabel(
  message: RoommateMessageView,
  conversation: ApiRoommateConversation
) {
  if (message.deliveryStatus === "sending") return "发送中";
  if (message.deliveryStatus === "failed") return "发送失败";
  if (
    conversation.peerLastReadMessageId &&
    conversation.peerLastReadAt &&
    (conversation.peerLastReadAt > message.createdAt ||
      (conversation.peerLastReadAt === message.createdAt &&
        conversation.peerLastReadMessageId >= message.id))
  ) {
    return "已读";
  }
  return "已发送";
}

export function PublishScreen({
  isPublishing,
  token = null,
  listings,
  user,
  publishAccess,
  editingListingId,
  onEditListing,
  onSave
}: {
  isPublishing: boolean;
  token?: string | null;
  listings: ApiListing[];
  user: SessionUser | null;
  publishAccess: PublishAccessResult;
  editingListingId: string | null;
  onEditListing: (listingId: string | null) => void;
  onSave: (draft: PublishDraft, shouldSubmit: boolean) => Promise<PublishSaveResult | null>;
}) {
  const editingListing =
    listings.find((listing) => listing.id === editingListingId) ?? null;

  return (
    <section
      id="publish-flow"
      className="app-shell app-grid w-full scroll-mt-[var(--app-header-offset)] items-start py-5 md:py-6"
    >
      <div className="app-section editorial-toolbar">
        <div>
          <span className="editorial-kicker">01 / 发布</span>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] md:text-4xl">发布房源流程</h1>
        </div>
      </div>
      <div className="col-span-full min-w-0 xl:col-span-8">
        {publishAccess.status === "needs-auth" ? (
          <Card className="border-dashed shadow-card">
            <CardHeader>
              <CardTitle>请先登录房东账户</CardTitle>
              <CardDescription>使用上方邮箱验证码登录后，系统会继续检查你的房东身份。</CardDescription>
            </CardHeader>
          </Card>
        ) : publishAccess.status === "profile-loading" ? (
          <Card className="border-dashed shadow-card">
            <CardHeader>
              <CardTitle>正在读取身份资料</CardTitle>
              <CardDescription>资料确认完成后才会开放发布表单。</CardDescription>
            </CardHeader>
          </Card>
        ) : publishAccess.status === "profile-error" ? (
          <Card className="border-dashed shadow-card">
            <CardHeader>
              <CardTitle>身份资料暂时无法读取</CardTitle>
              <CardDescription>请检查网络后重试，资料确认前不会开放发布表单。</CardDescription>
            </CardHeader>
          </Card>
        ) : publishAccess.status === "needs-profile" ? (
          <Card className="border-dashed shadow-card">
            <CardHeader>
              <CardTitle>请先完善身份资料</CardTitle>
              <CardDescription>填写显示名称、学校和城市后，系统会继续检查房东身份。</CardDescription>
            </CardHeader>
          </Card>
        ) : publishAccess.status === "needs-role" ? (
          <Card className="border-dashed shadow-card">
            <CardHeader>
              <CardTitle>请先设置房东身份</CardTitle>
              <CardDescription>在个人资料中选择“房东”或“租客兼房东”后即可发布。</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <PublishingFlow
            key={editingListing?.id ?? "new-listing"}
            initialDraft={editingListing ? mapApiListingToPublishDraft(editingListing) : null}
            isPublishing={isPublishing}
            token={token ?? ""}
            onSave={onSave}
          />
        )}
      </div>
      <aside className="col-span-full min-w-0 xl:col-span-4">
        <LandlordListingsPanel
          editingListingId={editingListingId}
          listings={listings}
          user={user}
          onEditListing={onEditListing}
        />
      </aside>
    </section>
  );
}

function LandlordListingsPanel({
  editingListingId,
  listings,
  user,
  onEditListing
}: {
  editingListingId: string | null;
  listings: ApiListing[];
  user: SessionUser | null;
  onEditListing: (listingId: string | null) => void;
}) {
  return (
    <Card className="h-fit shadow-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>我的房源</CardTitle>
            <CardDescription>
              {user ? `${user.email} · ${listings.length} 套房源` : "登录后显示发布状态"}
            </CardDescription>
          </div>
          <Badge variant={user ? "trust" : "secondary"}>{user ? "房东" : "游客"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {user && editingListingId ? (
          <Button variant="outline" onClick={() => onEditListing(null)}>
            <Plus data-icon="inline-start" />
            新建房源
          </Button>
        ) : null}
        {!user ? (
          <div className="rounded-md border bg-secondary p-4 text-sm font-semibold text-primary">
            先用邮箱验证码登录，再创建房源并查看审核状态。
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-md border bg-white p-4 text-sm font-semibold text-muted-foreground">
            还没有发布记录。创建后会先进入审核中，审核通过才会出现在租客找房页。
          </div>
        ) : (
          listings.map((listing) => {
            const status = normalizeListingStatus(listing.status);
            const meta = getListingStatusMeta(status);

            return (
              <div
                key={listing.id}
                className={cn(
                  "rounded-md border bg-white p-3",
                  editingListingId === listing.id && "border-trust-sky bg-trust-sky/5"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-primary">{listing.title}</div>
                    <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                      {listing.area}
                    </div>
                  </div>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm font-bold text-primary">
                  <span>${listing.price.toLocaleString()}/月</span>
                  <span>{listing.mediaCount ?? listing.media?.length ?? 0} 张媒体</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">{meta.description}</p>
                {status === "REJECTED" && listing.rejectionReason ? (
                  <p className="mt-2 rounded-md bg-secondary p-2 text-xs font-semibold text-primary">
                    {listing.rejectionReason}
                  </p>
                ) : null}
                {status === "DRAFT" || status === "REJECTED" ? (
                  <Button
                    className="mt-3 w-full"
                    variant="outline"
                    onClick={() => onEditListing(listing.id)}
                  >
                    继续编辑
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function normalizeListingStatus(status: ApiListing["status"]): ListingStatus {
  if (status === "SUBMITTED" || status === "APPROVED" || status === "REJECTED") return status;
  return "DRAFT";
}

function TripsScreen({
  viewingRequests,
  user,
  onOpenDealRoom
}: {
  viewingRequests: ViewingRequest[];
  user: SessionUser | null;
  onOpenDealRoom: () => void;
}) {
  return (
    <section className="app-shell app-grid w-full items-start py-5 md:py-6">
      <div className="app-section editorial-toolbar">
        <div>
          <span className="editorial-kicker">01 / 看房</span>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] md:text-4xl">我的看房记录</h1>
        </div>
      </div>
      <aside className="col-span-full min-w-0 lg:col-span-4">
        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle>后续交易功能</CardTitle>
            <CardDescription>以下能力尚未接通后端，本页不会模拟成功状态。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="secondary">在线申请 · 暂未开放</Badge>
            <Badge variant="secondary">支付 · 暂未开放</Badge>
            <Badge variant="secondary">资金托管 · 暂未开放</Badge>
          </CardContent>
        </Card>
      </aside>
      <div className="col-span-full min-w-0 lg:col-span-4 xl:col-span-8">
        <Card className="shadow-panel">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>看房安排</CardTitle>
              <CardDescription>
                {user ? `登录账户的 ${viewingRequests.length} 条服务端记录` : "登录后显示你的看房记录"}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onOpenDealRoom}>
              <MessageCircle data-icon="inline-start" />
              打开消息
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-[24px] border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-extrabold text-primary">看房安排</div>
                <div className="text-sm font-semibold text-muted-foreground">仅展示当前登录账户在服务端保存的看房请求</div>
              </div>
              <CalendarDays className="size-5 text-[#006AFF]" aria-hidden="true" />
            </div>
            <div className="mt-4 grid gap-3">
              {viewingRequests.length > 0 ? (
                viewingRequests.map((request) => (
                  <div key={request.id} className="grid gap-3 rounded-[22px] border border-blue-100 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="font-extrabold text-primary">{request.timeLabel}</div>
                      <div className="mt-1 text-sm font-semibold text-muted-foreground">
                        {request.listingTitle} · {getViewingModeLabel(request.mode)} · {request.participantNames.join(", ")}
                      </div>
                    </div>
                    <Badge variant={request.status === "CONFIRMED" ? "success" : "trust"}>
                      {getViewingStatusLabel(request.status)}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-blue-200 bg-white p-4 text-sm font-semibold text-muted-foreground">
                  {user ? "还没有看房安排。回到房源详情或消息中选择时间。" : "请先登录查看个人看房记录。"}
                </div>
              )}
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ListingDetailScreen({
  listing,
  filters,
  favoriteIds,
  contactedIds,
  tourRequestedIds,
  dealStage,
  groupMembers,
  onBack,
  onFavorite,
  onContact,
  onRequestTour,
  onApply,
  onOpenRoommates
}: {
  listing: Listing;
  filters: SearchFilters;
  favoriteIds: Set<string>;
  contactedIds: Set<string>;
  tourRequestedIds: Set<string>;
  dealStage: string;
  groupMembers: Roommate[];
  onBack: () => void;
  onFavorite: (id: string) => void;
  onContact: (listing: Listing) => void;
  onRequestTour: (listing: Listing, slot?: ViewingSlot) => void;
  onApply: (listing: Listing) => void;
  onOpenRoommates: () => void;
}) {
  const detail = buildListingDetail(listing, filters);
  const flow = getListingFlowStatus(listing.id, {
    favoriteIds,
    contactedIds,
    tourRequestedIds
  });
  const roommateCount = groupMembers.length > 0 ? groupMembers.length + 1 : 1;
  const perPersonPrice = Math.round(listing.price / roommateCount);

  return (
    <section className="app-shell app-grid w-full items-start py-5 md:py-6">
      <div className="app-section editorial-toolbar">
        <div className="min-w-0">
          <span className="editorial-kicker">01 / 房源</span>
          <Button variant="outline" className="mt-2 w-fit" onClick={onBack}>
            <ArrowRight className="rotate-180" data-icon="inline-start" />
            返回房源
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {flow.isContacted ? <Badge variant="success">已联系</Badge> : null}
          {flow.isTourRequested ? <Badge variant="trust">已预约看房</Badge> : null}
        </div>
      </div>

      <div className="col-span-full flex min-w-0 flex-col gap-5 xl:col-span-8">
          <Card className="overflow-hidden shadow-panel">
            <div className="grid grid-cols-1 gap-1 md:grid-cols-[1.5fr_1fr]">
              <div
                className="min-h-[320px] bg-cover bg-center md:min-h-[440px]"
                style={{ backgroundImage: `url(${detail.gallery[0]})` }}
              />
              <div className="grid grid-cols-3 gap-1 md:grid-cols-1">
                {detail.gallery.slice(1).map((image, index) => (
                  <div
                    key={image}
                    className="min-h-28 bg-cover bg-center md:min-h-0"
                    style={{ backgroundImage: `url(${image})` }}
                    aria-label={`房源照片 ${index + 2}`}
                  />
                ))}
              </div>
            </div>
            <CardContent className="flex flex-col gap-5 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="trust">{detail.neighborhood}</Badge>
                    <Badge variant="success">{listing.score} 分</Badge>
                    <Badge variant="secondary">{detail.stayLabel}</Badge>
                  </div>
                  <h1 className="mt-3 text-3xl font-extrabold text-primary">{listing.title}</h1>
                  <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <MapPin className="size-4" aria-hidden="true" />
                    {listing.area}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <div className="text-3xl font-extrabold text-primary">${listing.price.toLocaleString()}</div>
                  <div className="text-sm font-semibold text-muted-foreground">
                    <span className="line-through">${listing.originalPrice.toLocaleString()}</span>
                    <span> / 月</span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-trust-green">
                    省 ${detail.monthlySavings.toLocaleString()}/月
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric icon={BedDouble} label="卧室" value={`${listing.beds} 间`} />
                <Metric icon={Bath} label="卫浴" value={`${listing.baths} 间`} />
                <Metric icon={Clock3} label="通勤" value={listing.commute} />
                <Metric icon={ShieldCheck} label="信任" value={listing.trust} />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <DetailList title="房源亮点" items={detail.sections.highlights} />
                <DetailList title="入住规则" items={detail.sections.houseRules} />
                <DetailList title="下一步" items={detail.sections.moveIn} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle>动态匹配</CardTitle>
              <CardDescription>根据当前室友、收藏和日期实时更新</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-md border bg-white p-4">
                <div className="text-xs font-bold text-muted-foreground">当前小组</div>
                <div className="mt-2 text-lg font-extrabold text-primary">
                  {groupMembers.length > 0
                    ? groupMembers.map((member) => member.name).join("、")
                    : "尚未组成小组"}
                </div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">
                  {groupMembers.length > 0
                    ? "仅显示当前明确选择的小组"
                    : "不会自动加入目录中的室友"}
                </div>
              </div>
              <div className="rounded-md border bg-white p-4">
                <div className="text-xs font-bold text-muted-foreground">小组人均</div>
                <div className="mt-2 text-lg font-extrabold text-primary">${perPersonPrice.toLocaleString()}/月</div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">{roommateCount} 人预算估算</div>
              </div>
              <div className="rounded-md border bg-white p-4">
                <div className="text-xs font-bold text-muted-foreground">流程状态</div>
                <div className="mt-2 text-lg font-extrabold text-primary">
                  {dealStage}
                </div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">操作会即时同步到本页</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="col-span-full flex min-w-0 flex-col gap-4 xl:col-span-4 xl:sticky xl:top-[var(--app-header-offset)]">
          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle>下一步</CardTitle>
              <CardDescription>{detail.stayLabel}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                variant={flow.isFavorite ? "accept" : "outline"}
                className="w-full justify-between"
                onClick={() => onFavorite(listing.id)}
              >
                {flow.isFavorite ? "已收藏" : "收藏房源"}
                <Heart className={cn(flow.isFavorite && "fill-current")} data-icon="inline-end" />
              </Button>
              <Button
                variant={flow.isContacted ? "secondary" : "outline"}
                className="w-full justify-between"
                onClick={() => onContact(listing)}
              >
                {flow.isContacted ? "继续沟通" : "联系房东"}
                <MessageCircle data-icon="inline-end" />
              </Button>
              <Button
                variant={flow.isTourRequested ? "secondary" : "trust"}
                className="w-full justify-between"
                onClick={() => onRequestTour(listing)}
              >
                {flow.isTourRequested ? "看房请求已发送" : "选择看房时间"}
                <CalendarDays data-icon="inline-end" />
              </Button>
              <Button
                variant="trust"
                className="w-full justify-between"
                onClick={() => onApply(listing)}
              >
                在线申请（暂未开放）
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Separator />
              <Button variant="outline" className="w-full justify-between" onClick={onOpenRoommates}>
                找室友一起租
                <Users data-icon="inline-end" />
              </Button>
              <div className="rounded-md bg-secondary p-3 text-sm font-semibold text-primary">
                <div className="flex justify-between">
                  <span>月租</span>
                  <span>${listing.price.toLocaleString()}</span>
                </div>
                <div className="mt-2 flex justify-between text-muted-foreground">
                  <span>支付</span>
                  <span>暂未开放</span>
                </div>
                <div className="mt-2 flex justify-between text-muted-foreground">
                  <span>资金托管</span>
                  <span>暂未开放</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle>消息中心</CardTitle>
              <CardDescription>服务端创建会话成功后才会进入消息页面。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full justify-between" variant="secondary" onClick={() => onContact(listing)}>
                打开消息
                <MessageCircle data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        </aside>
    </section>
  );
}

function DealCommunicationPanel({
  listing,
  thread,
  stage,
  viewingSlots,
  latestViewingRequest,
  messagePending,
  tourPending,
  decisionPending,
  onSendMessage,
  onRequestTour,
  onViewingDecision
}: {
  listing: Listing;
  thread: DealThread;
  stage: string;
  viewingSlots: ViewingSlot[];
  latestViewingRequest: ViewingRequest | null;
  messagePending: boolean;
  tourPending: boolean;
  decisionPending: boolean;
  onSendMessage: (listing: Listing, body: string) => Promise<boolean>;
  onRequestTour: (listing: Listing, slot?: ViewingSlot) => Promise<boolean>;
  onViewingDecision: (
    listing: Listing,
    request: ViewingRequest,
    decision: "confirm" | "decline"
  ) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState(viewingSlots[0]?.id ?? "");
  const [confirmTour, setConfirmTour] = useState(false);
  const selectedSlot = viewingSlots.find((slot) => slot.id === selectedSlotId) ?? viewingSlots[0];
  const visibleMessages = thread.messages.slice(-5);
  const quickReplies = [
    "这套现在还可以约看吗？",
    "可以先发一段视频看房吗？",
    "我想和室友一起看房。"
  ];

  useEffect(() => {
    if (viewingSlots.length > 0 && !viewingSlots.some((slot) => slot.id === selectedSlotId)) {
      setSelectedSlotId(viewingSlots[0].id);
    }
  }, [selectedSlotId, viewingSlots]);

  async function submitMessage(body = draft) {
    if (!body.trim()) return;
    const sent = await onSendMessage(listing, body);
    if (sent) setDraft("");
  }

  return (
    <Card className="shadow-panel" data-testid="deal-dm-panel">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>消息与看房</CardTitle>
            <CardDescription>{thread.subject}</CardDescription>
          </div>
          <Badge variant={latestViewingRequest ? "trust" : "secondary"}>{stage}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {thread.participants.map((participant) => (
            <Badge key={participant} variant={participant === "You" || participant === "我" ? "trust" : "secondary"}>
              {participant === "You" ? "我" : participant}
            </Badge>
          ))}
        </div>

        <div className="flex max-h-[320px] flex-col gap-3 overflow-y-auto rounded-[24px] border bg-blue-50/50 p-3 app-scrollbar">
          {visibleMessages.length === 0 ? (
            <div className="rounded-[18px] border border-dashed bg-white p-4 text-center text-sm font-semibold text-muted-foreground">
              暂无消息。只有你真正发送成功的内容才会显示在这里。
            </div>
          ) : null}
          {visibleMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[88%] rounded-[22px] border px-3 py-2 text-sm shadow-sm",
                message.align === "right"
                  ? "ml-auto border-[#006AFF]/20 bg-[#006AFF] text-white"
                  : "border-blue-100 bg-white text-primary"
              )}
            >
              <div className={cn("flex items-center justify-between gap-3 text-[11px] font-black", message.align === "right" ? "text-white/80" : "text-muted-foreground")}>
                <span>{message.author}</span>
                <span>{message.time}</span>
              </div>
              <p className="mt-1 font-semibold leading-5">{message.body}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {quickReplies.map((reply) => (
            <Button key={reply} variant="secondary" size="sm" className="rounded-full" onClick={() => setDraft(getComposerDraftAfterQuickReply(draft, reply))}>
              {reply}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_56px] items-stretch gap-2">
          <textarea
            className="min-h-20 resize-none rounded-[22px] border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-primary shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-[#006AFF]"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入给房东的消息"
          />
          <Button className="h-20 rounded-[22px] bg-[#006AFF] px-4 text-white hover:bg-[#0D4599]" onClick={() => void submitMessage()} disabled={messagePending || !draft.trim()}>
            <Send aria-hidden="true" />
            <span className="sr-only">{messagePending ? "消息提交中" : "发送消息"}</span>
          </Button>
        </div>

        <Separator />

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-primary">预约看房</div>
              <div className="text-xs font-semibold text-muted-foreground">
                {latestViewingRequest
                  ? `${latestViewingRequest.timeLabel} · ${getViewingModeLabel(latestViewingRequest.mode)}`
                  : "选择时间后会同步到看房和消息页面"}
              </div>
            </div>
            {latestViewingRequest ? (
              <Badge variant={latestViewingRequest.status === "CONFIRMED" ? "success" : "trust"}>
                {getViewingStatusLabel(latestViewingRequest.status)}
              </Badge>
            ) : null}
          </div>
          {thread.viewerRole === "host" ? (
            latestViewingRequest && canHostDecideViewing(thread, latestViewingRequest) ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={decisionPending}
                  onClick={() => void onViewingDecision(listing, latestViewingRequest, "confirm")}
                >
                  确认看房
                </Button>
                <Button
                  variant="outline"
                  disabled={decisionPending}
                  onClick={() => void onViewingDecision(listing, latestViewingRequest, "decline")}
                >
                  拒绝请求
                </Button>
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed p-3 text-sm font-semibold text-muted-foreground">
                {latestViewingRequest ? "当前看房请求无需处理。" : "房客尚未发起看房请求。"}
              </div>
            )
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2">
                {viewingSlots.map((slot) => {
              const selected = selectedSlot?.id === slot.id;

              return (
                <button
                  key={slot.id}
                  className={cn(
                    "flex items-center justify-between rounded-[20px] border px-3 py-3 text-left text-sm font-extrabold transition-all",
                    selected
                      ? "border-[#006AFF] bg-[#006AFF]/10 text-[#006AFF]"
                      : "border-blue-100 bg-white text-primary hover:bg-blue-50"
                  )}
                  data-testid={`viewing-slot-${slot.id}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedSlotId(slot.id)}
                >
                  <span>{slot.label}</span>
                  <span className="text-xs font-black">{getViewingModeLabel(slot.mode)}</span>
                </button>
              );
                })}
              </div>
              <Button
                className="mt-3 h-11 w-full rounded-full bg-gradient-to-r from-[#006AFF] to-[#0D4599] font-extrabold text-white hover:brightness-95"
                data-testid="confirm-viewing-button"
                disabled={tourPending || !selectedSlot}
                onClick={async () => {
                  if (!confirmTour) {
                    setConfirmTour(true);
                    return;
                  }
                  const saved = await onRequestTour(listing, selectedSlot);
                  if (saved) setConfirmTour(false);
                }}
              >
                <CalendarDays data-icon="inline-start" />
                {tourPending
                  ? "请求提交中"
                  : confirmTour
                    ? `再次确认：${selectedSlot?.label ?? ""}`
                    : latestViewingRequest
                      ? "调整看房时间"
                      : "确认预约看房"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function getViewingModeLabel(mode: ViewingSlot["mode"]) {
  return mode === "video" ? "视频看房" : "线下看房";
}

function getViewingStatusLabel(status: ViewingRequest["status"]) {
  if (status === "CONFIRMED") return "已确认";
  if (status === "COMPLETED") return "已完成";
  if (status === "CANCELLED") return "已取消";
  return "已请求";
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-white p-4">
      <h2 className="text-sm font-extrabold text-primary">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex gap-2 text-sm font-semibold text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-trust-green" aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketToolbar({
  listingCount,
  heading,
  summary,
  viewMode,
  onViewModeChange,
  favoriteCount,
  dateRangeLabel,
  onOpenRoommates
}: {
  listingCount: number;
  heading: string;
  summary: string;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  favoriteCount: number;
  dateRangeLabel: string;
  onOpenRoommates: () => void;
}) {
  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardContent className="editorial-toolbar p-0">
        <div>
          <span className="editorial-kicker">02 / 找房</span>
          <h1 className="mt-2 break-words text-3xl font-black tracking-[-0.035em] md:text-4xl">{heading}</h1>
          <p className="text-sm font-medium text-muted-foreground">
            {summary} · 本页 {listingCount} 套 · {favoriteCount} 个本机收藏
          </p>
          <p className="mt-1 text-xs font-bold text-trust-blue">{dateRangeLabel}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" onClick={onOpenRoommates}>
            <Users data-icon="inline-start" />
            找室友
          </Button>
          <Tabs
            value={viewMode}
            onValueChange={(value) => onViewModeChange(value as ViewMode)}
            className="w-full lg:w-auto"
          >
            <TabsList className="grid w-full grid-cols-2 lg:w-[220px]">
              <TabsTrigger value="map" className="px-2">地图</TabsTrigger>
              <TabsTrigger value="list" className="px-2">列表</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}

function MapCanvas({
  className,
  listings,
  totalResultCount,
  selectedListing,
  onSelect
}: {
  className?: string;
  listings: Listing[];
  totalResultCount: number;
  selectedListing: Listing;
  onSelect: (listing: Listing) => void;
}) {
  const mapListings = listings;
  const defaultCenter = useMemo(() => getMapCenterForListings(mapListings), [mapListings]);
  const mapSummary = useMemo(() => getMapSummary(mapListings), [mapListings]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapSize, setMapSize] = useState<MapSize>(defaultMapViewportSize);
  const [mapCenter, setMapCenter] = useState<MapPoint>(defaultCenter);
  const [zoom, setZoom] = useState(11);
  const tiles = useMemo(() => getMapTiles(mapCenter, zoom, mapSize), [mapCenter, mapSize, zoom]);
  const markers = useMemo(() => getMapMarkers(mapListings, mapCenter, zoom, mapSize), [mapCenter, mapListings, mapSize, zoom]);

  useEffect(() => {
    setMapCenter(defaultCenter);
  }, [defaultCenter]);

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const measuredElement = element;

    function updateMapSize() {
      const rect = measuredElement.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (width <= 0 || height <= 0) return;

      setMapSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      );
    }

    updateMapSize();
    const observer = new ResizeObserver(updateMapSize);
    observer.observe(measuredElement);

    return () => observer.disconnect();
  }, []);

  function resetMap() {
    setMapCenter(defaultCenter);
    setZoom(11);
  }

  return (
    <Card className={cn("overflow-hidden shadow-panel", className)}>
      <div className="grid min-h-[520px] grid-cols-1">
        <div ref={mapRef} className="relative min-h-[360px] overflow-hidden bg-[#DCE7EA]">
          <div className="absolute inset-0">
            {tiles.map((tile) => (
              <div
                key={tile.id}
                className="absolute size-64 select-none bg-cover bg-center"
                style={{ backgroundImage: `url(${tile.url})`, left: tile.x, top: tile.y }}
              />
            ))}
          </div>
          <div className="absolute left-3 top-3 flex flex-col gap-2">
            <Button
              variant="outline"
              size="icon"
              className="bg-white/95"
              aria-label="放大地图"
              onClick={() => setZoom((current) => Math.min(13, current + 1))}
            >
              <Plus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-white/95"
              aria-label="缩小地图"
              onClick={() => setZoom((current) => Math.max(9, current - 1))}
            >
              <Minus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-white/95"
              aria-label="重置地图"
              onClick={resetMap}
            >
              <LocateFixed />
            </Button>
          </div>
          <div className="absolute right-3 top-3 grid grid-cols-3 overflow-hidden rounded-[18px] border bg-white/95 text-center shadow-card">
	            <MapStat label="总结果" value={`${totalResultCount}`} />
	            <MapStat label="本页标记" value={`${mapSummary.count}`} />
	            <MapStat label="最低" value={mapSummary.minimumPrice ? `$${mapSummary.minimumPrice.toLocaleString()}` : "--"} />
          </div>
          {markers.map((marker) => (
	              <MapMarker
	                key={marker.id}
	                label={marker.label}
                  title={marker.title}
	                active={isSelectedListing(selectedListing.id, marker)}
	                left={marker.x}
	                top={marker.y}
              onClick={() => {
                const listing = mapListings.find((item) => item.id === marker.id);
                if (!listing) return;

                setMapCenter({ lat: marker.lat, lng: marker.lng });
                onSelect(listing);
              }}
            />
          ))}
          {mapListings.length === 0 ? (
            <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-md border bg-white/95 p-4 text-center shadow-card">
              <div className="text-sm font-extrabold text-primary">当前地图没有可显示房源</div>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                放宽预算、设施或地点后，地图会重新显示价格标记。
              </p>
            </div>
          ) : null}
          <div className="absolute bottom-2 right-3 rounded bg-white/90 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
            © OpenStreetMap contributors
          </div>
          {mapListings.length > 0 ? (
            <div className="absolute bottom-5 left-5 rounded-md border bg-white/94 p-3 shadow-card">
              <div className="flex items-center gap-2 text-sm font-bold text-primary">
                <Navigation className="size-4 text-trust-sky" aria-hidden="true" />
                {selectedListing.commute}
              </div>
              <div className="mt-1 text-xs font-semibold text-muted-foreground">
                {selectedListing.transit}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col justify-between gap-4 border-t bg-white p-5">
          {mapListings.length > 0 ? (
            <>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="trust">地标通勤</Badge>
                  <Badge variant="secondary">{mapSummary.count} 个地图价格标记</Badge>
                </div>
                <h2 className="mt-3 text-xl font-bold text-primary">
                  {selectedListing.title}
                </h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {selectedListing.area}
                </p>
              </div>
              <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
                <Metric icon={Clock3} label="通勤" value={selectedListing.commute} />
                <Metric icon={DollarSign} label="净租金" value={`$${selectedListing.price}/月`} />
                <Metric icon={BedDouble} label="卧室" value={`${selectedListing.beds} 间`} />
                <Metric icon={ShieldCheck} label="信任" value={selectedListing.trust} />
              </div>
            </>
          ) : (
            <div className="rounded-md border bg-secondary p-4 text-sm font-semibold text-primary">
              地图会跟随筛选条件更新。当前没有价格标记时，先回到左侧调整关键词、预算或设施。
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function MapMarker({
  label,
  title,
  active,
  left,
  top,
  onClick
}: {
  label: string;
  title?: string;
  active?: boolean;
  left: number;
  top: number;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-sm font-bold shadow-card transition-transform hover:scale-105",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white bg-white text-primary"
      )}
      onClick={onClick}
      style={{ left, top }}
      type="button"
      aria-label={title ? `选择地图房源 ${title} ${label}` : `选择地图房源 ${label}`}
    >
      {label}
    </button>
  );
}

function MapStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[72px] px-3 py-2">
      <div className="text-[10px] font-black uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-black text-primary">{value}</div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-secondary p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-1 line-clamp-2 break-words text-sm font-bold text-primary">{value}</div>
    </div>
  );
}

function ListingGrid({
  listings,
  selectedId,
  favoriteIds,
  onPreview,
  onOpenListing,
  onFavorite,
  actionLabel
}: {
  listings: Listing[];
  selectedId: string;
  favoriteIds: Set<string>;
  onPreview: (listing: Listing) => void;
  onOpenListing: (listing: Listing) => void;
  onFavorite: (id: string) => void;
  actionLabel: string;
}) {
  return (
    <div className="app-card-grid">
      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          selected={isSelectedListing(selectedId, listing)}
          favorite={favoriteIds.has(listing.id)}
          onPreview={onPreview}
          onOpenListing={onOpenListing}
          onFavorite={onFavorite}
          actionLabel={actionLabel}
        />
      ))}
    </div>
  );
}

function ListingCard({
  listing,
  selected,
  favorite,
  onPreview,
  onOpenListing,
  onFavorite,
  actionLabel
}: {
  listing: Listing;
  selected: boolean;
  favorite: boolean;
  onPreview: (listing: Listing) => void;
  onOpenListing: (listing: Listing) => void;
  onFavorite: (id: string) => void;
  actionLabel: string;
}) {
  const gallery = useMemo(() => buildListingGallery(listing), [listing]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const currentImage = gallery[galleryIndex] ?? listing.image;

  function moveGallery(direction: -1 | 1) {
    setGalleryIndex((current) => getGalleryIndex(current, direction, gallery.length));
  }

  return (
    <article
      id={getListingCardDomId(listing.id)}
      className={cn(
        "group flex h-full scroll-mt-[var(--app-header-offset)] flex-col overflow-hidden rounded-[18px] border bg-card text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-panel",
        selected ? "border-accent ring-4 ring-accent/10" : "border-border"
      )}
    >
      <div className="relative">
        <button
          className="block aspect-[16/11] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]"
          style={{ backgroundImage: `url(${currentImage})` }}
          type="button"
          onClick={() => onPreview(listing)}
          aria-label={`在地图上选中 ${listing.title}`}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/38 via-transparent to-transparent" />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge className="border-white/60 bg-white/95 text-[#006AFF] shadow-sm" title={`来源：${listing.trust}`}>
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {getTrustSourceLabel(listing.trust)}
          </Badge>
          {listing.tags.some((tag) => tag.includes("Group")) ? (
            <Badge className="border-emerald-100 bg-emerald-50 text-emerald-700 shadow-sm">小组匹配</Badge>
          ) : null}
        </div>
        <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            className="size-9 border-white/70 bg-white/95 shadow-sm"
            aria-label={`上一张照片：${listing.title}`}
            onClick={() => moveGallery(-1)}
          >
            <ArrowRight className="rotate-180" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9 border-white/70 bg-white/95 shadow-sm"
            aria-label={`下一张照片：${listing.title}`}
            onClick={() => moveGallery(1)}
          >
            <ArrowRight />
          </Button>
        </div>
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
          {gallery.map((image, index) => (
            <span
              key={image}
              className={cn(
                "size-1.5 rounded-full border border-white/80",
                index === galleryIndex ? "bg-white" : "bg-white/45"
              )}
            />
          ))}
        </div>
        <Button
          variant={favorite ? "accept" : "outline"}
          size="icon"
          className="absolute right-3 top-3 border-white/70 bg-white/95 shadow-sm"
          aria-label={favorite ? "取消收藏" : "收藏房源"}
          onClick={() => onFavorite(listing.id)}
        >
          <Heart className={cn(favorite && "fill-current")} />
        </Button>
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full border border-white/30 bg-white/95 px-3 py-1.5 text-sm font-black text-primary shadow-sm">
          <Star className="size-4 fill-current text-trust-amber" aria-hidden="true" />
          {listing.score}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <button className="min-w-0 text-left" type="button" onClick={() => onPreview(listing)}>
            <div className="line-clamp-2 text-lg font-black leading-tight text-primary">{listing.title}</div>
            <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              {listing.area}
            </div>
          </button>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-primary">${listing.price}</span>
          <span className="text-sm font-semibold text-muted-foreground line-through">
            ${listing.originalPrice}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">/月</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {listing.tags.map((tag) => (
            <Badge key={tag} variant={tag.includes("Group") ? "success" : "secondary"}>
              {tag}
            </Badge>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
          <Button
            variant={selected ? "trust" : "outline"}
            className="h-11 w-full justify-between font-black"
            onClick={() => onOpenListing(listing)}
          >
            {actionLabel}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function getTrustSourceLabel(trust: string) {
  if (trust.includes("平台已审核")) return "平台已审核";
  if (trust.includes("待平台审核") || trust.includes("待审核")) return "待平台审核";
  return "用户声明";
}

function EmptyResults({ filters, onClear }: { filters: SearchFilters; onClear: () => void }) {
  const insight = buildSearchInsight(filters, 0);

  return (
    <Card className="shadow-panel">
      <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-md bg-secondary text-primary">
          <Search className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary">没有命中的房源</h2>
          <p className="mt-2 max-w-md text-sm font-medium text-muted-foreground">
            {insight.suggestion}
          </p>
        </div>
        <div className="flex max-w-2xl flex-wrap justify-center gap-2">
          {insight.chips.map((chip) => (
            <Badge key={chip} variant="secondary">
              {chip}
            </Badge>
          ))}
        </div>
        <Button variant="trust" onClick={onClear}>
          重置筛选
        </Button>
      </CardContent>
    </Card>
  );
}

function PublishingFlow({
  initialDraft,
  isPublishing,
  token,
  onSave
}: {
  initialDraft: PublishDraft | null;
  isPublishing: boolean;
  token: string;
  onSave: (draft: PublishDraft, shouldSubmit: boolean) => Promise<PublishSaveResult | null>;
}) {
  const steps: Array<{ key: PublishStep; code: string; title: string; detail: string }> = [
    { key: "basic", code: "01", title: "基础信息", detail: "标题、区域、可租期、房型与交通" },
    { key: "pricing", code: "02", title: "价格与设施", detail: "月租、原价、设施与声明" },
    { key: "media", code: "03", title: "图片与分类", detail: "文件上传、排序与封面" },
    { key: "review", code: "04", title: "预览与提交", detail: "确认服务端将保存的内容" }
  ];
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<PublishDraft>(
    () =>
      initialDraft ?? {
        title: "",
        area: "",
        availableFrom: "",
        availableTo: "",
        beds: 1,
        baths: 1,
        commute: "",
        transit: "",
        price: 0,
        originalPrice: 0,
        tags: [],
        landlordAware: false,
        remoteListingId: null
      }
  );
  const [mediaSummary, setMediaSummary] = useState<ListingMediaSummary>({
    totalCount: 0,
    readyCount: 0,
    pendingCount: 0,
    failedCount: 0,
    mutationPending: false
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const step = steps[stepIndex];

  async function goToStep(nextIndex: number) {
    if (nextIndex > stepIndex) {
      const nextErrors = getPublishStepErrors(draft, step.key, mediaSummary);
      if (nextErrors.length > 0) {
        setErrors(nextErrors);
        return;
      }
      if (step.key === "pricing" && !draft.remoteListingId) {
        const result = await onSave(draft, false);
        if (!result) return;
        setDraft((current) => ({ ...current, remoteListingId: result.remoteListingId }));
      }
    }
    setErrors([]);
    setConfirmSubmit(false);
    setStepIndex(Math.min(Math.max(0, nextIndex), steps.length - 1));
  }

  async function save(shouldSubmit: boolean) {
    const nextErrors = shouldSubmit
      ? getPublishStepErrors(draft, "review", mediaSummary)
      : [
          ...getPublishStepErrors(draft, "basic", mediaSummary),
          ...getPublishStepErrors(draft, "pricing", mediaSummary)
        ];
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (shouldSubmit && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }

    const result = await onSave(draft, shouldSubmit);
    if (!result) return;
    setDraft((current) => ({
      ...current,
      remoteListingId: result.remoteListingId
    }));
    setConfirmSubmit(false);
  }

  function toggleTag(tag: string) {
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag]
    }));
  }

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>发布房源流程</CardTitle>
            <CardDescription>
              房源资料与图片分别持久化；提交审核后图片将锁定。
              {draft.remoteListingId ? ` 远程草稿：${draft.remoteListingId}` : ""}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void save(false)} disabled={isPublishing}>
            <Building2 data-icon="inline-start" />
            {isPublishing ? "保存中" : "保存草稿"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {steps.map((item, index) => (
            <button
              key={item.key}
              className={cn(
                "rounded-md border bg-white p-4 text-left transition-colors",
                index === stepIndex && "border-trust-sky bg-trust-sky/5"
              )}
              type="button"
              aria-current={index === stepIndex ? "step" : undefined}
              onClick={() => void goToStep(index)}
            >
              <div className="text-xs font-extrabold text-trust-sky">{item.code}</div>
              <div className="mt-2 text-sm font-bold text-primary">{item.title}</div>
              <div className="mt-1 text-sm font-medium text-muted-foreground">{item.detail}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-md border bg-white p-4">
          {step.key === "basic" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <PublishField label="房源标题" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} />
              <PublishField label="区域" value={draft.area} onChange={(value) => setDraft({ ...draft, area: value })} />
              <PublishField type="date" label="可入住日期" value={draft.availableFrom} onChange={(value) => setDraft({ ...draft, availableFrom: value })} />
              <PublishField type="date" label="最晚退租日期" value={draft.availableTo} onChange={(value) => setDraft({ ...draft, availableTo: value })} />
              <PublishNumberField label="卧室" value={draft.beds} min={0} onChange={(value) => setDraft({ ...draft, beds: value })} />
              <PublishNumberField label="卫浴" value={draft.baths} min={0} onChange={(value) => setDraft({ ...draft, baths: value })} />
              <PublishField label="通勤说明" value={draft.commute} onChange={(value) => setDraft({ ...draft, commute: value })} />
              <PublishField label="交通说明" value={draft.transit} onChange={(value) => setDraft({ ...draft, transit: value })} />
            </div>
          ) : null}

          {step.key === "media" ? (
            draft.remoteListingId && token ? (
              <ListingMediaUploader
                listingId={draft.remoteListingId}
                token={token}
                disabled={isPublishing}
                onSummaryChange={setMediaSummary}
              />
            ) : (
              <div className="rounded-md border border-dashed bg-secondary p-4 text-sm font-semibold text-muted-foreground">
                请先完成基础信息和价格设置，系统会保存草稿后开放图片上传。
              </div>
            )
          ) : null}

          {step.key === "pricing" ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <PublishNumberField label="月租" value={draft.price} min={1} onChange={(value) => setDraft({ ...draft, price: value })} />
                <PublishNumberField label="原价" value={draft.originalPrice} min={1} onChange={(value) => setDraft({ ...draft, originalPrice: value })} />
              </div>
              <fieldset>
                <legend className="text-sm font-semibold">设施</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Wi-Fi", "带家具", "独卫", "近地铁", "宠物友好", "洗烘"].map((tag) => (
                    <Button key={tag} variant={draft.tags.includes(tag) ? "secondary" : "outline"} aria-pressed={draft.tags.includes(tag)} onClick={() => toggleTag(tag)}>{tag}</Button>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-start gap-3 rounded-md border bg-secondary p-3 text-sm font-semibold">
                <input type="checkbox" className="mt-1" checked={draft.landlordAware} onChange={(event) => setDraft({ ...draft, landlordAware: event.target.checked })} />
                <span>我声明房东已知情。此信息仅为用户声明，发布后统一显示“待平台审核”。</span>
              </label>
            </div>
          ) : null}

          {step.key === "review" ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <PublishReviewItem label="标题" value={draft.title || "未填写"} />
                <PublishReviewItem label="区域" value={draft.area || "未填写"} />
                <PublishReviewItem label="可入住日期" value={draft.availableFrom || "未填写"} />
                <PublishReviewItem label="最晚退租日期" value={draft.availableTo || "未填写"} />
                <PublishReviewItem label="价格" value={`$${draft.price.toLocaleString()} / 月`} />
                <PublishReviewItem label="图片" value={`${mediaSummary.readyCount} 张已保存图片`} />
                <PublishReviewItem label="设施" value={draft.tags.join("、") || "未选择"} />
                <PublishReviewItem label="Trust 来源" value={draft.landlordAware ? "用户声明 · 待平台审核" : "未声明 · 待平台审核"} />
              </div>
              {confirmSubmit ? (
                <div className="rounded-md border border-trust-amber bg-amber-50 p-4 text-sm font-semibold text-primary">
                  请再次确认提交。提交后房源进入平台审核，在审核完成前不会标记为“平台已审核”。
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void save(false)} disabled={isPublishing}>保存草稿</Button>
                <Button variant="trust" onClick={() => void save(true)} disabled={isPublishing || mediaSummary.mutationPending}>
                  {isPublishing ? "提交中" : confirmSubmit ? "确认提交审核" : "提交审核"}
                </Button>
              </div>
            </div>
          ) : null}

          {errors.length > 0 ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
              {errors.map((error) => <div key={error}>{error}</div>)}
            </div>
          ) : null}
          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" disabled={stepIndex === 0 || isPublishing} onClick={() => void goToStep(stepIndex - 1)}>上一步</Button>
            {stepIndex < steps.length - 1 ? (
              <Button variant="trust" disabled={isPublishing || mediaSummary.mutationPending} onClick={() => void goToStep(stepIndex + 1)}>下一步</Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PublishField({
  label,
  value,
  type = "text",
  disabled = false,
  onChange
}: {
  label: string;
  value: string;
  type?: "text" | "date";
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <Input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function PublishNumberField({
  label,
  value,
  min,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <Input type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function PublishReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-secondary p-3">
      <div className="text-xs font-bold text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-extrabold text-primary">{value}</div>
    </div>
  );
}

function StatusToast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-md border bg-white/96 px-4 py-3 text-sm font-semibold text-primary shadow-panel backdrop-blur">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 text-trust-green" aria-hidden="true" />
        <span className="min-w-0 truncate">{message}</span>
      </div>
    </div>
  );
}
