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
  Coffee,
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  getMyProfile,
  getSessionUser,
  apiPost,
  requestEmailCode,
  updateMyProfile,
  verifyEmailCode,
  type ApiProfile,
  type ApiDealRoom,
  type ApiListing,
  type ApiRoommate,
  type ApiRoommateActionResponse,
  type ApiTrip,
  type ApiTrustQueue,
  type ApiDealThread,
  type ApiViewingRequest,
  type SessionUser,
  type UpdateProfileInput,
  type CreateViewingRequestInput
} from "@/lib/api";
import { getApiPresentationState } from "@/lib/api-status";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession
} from "@/lib/auth-session";
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
import { filterSavedListings, getListingCardDomId, getVisibleSelectedListing, isSelectedListing } from "@/lib/listing-selection";
import {
  buildListingDetail,
  buildListingGallery,
  getGalleryIndex,
  getListingFlowStatus
} from "@/lib/listing-detail";
import {
  appendDealMessage,
  buildInitialDealThread,
  buildViewingSlots,
  createViewingRequest,
  getComposerDraftAfterQuickReply,
  getDealWorkflowStage,
  getLatestViewingRequest,
  upsertViewingRequest,
  type DealThread,
  type ViewingRequest,
  type ViewingSlot
} from "@/lib/deal-workflow";
import { getListingStatusMeta, sortOwnerListings, type ListingStatus } from "@/lib/landlord-listings";
import {
  addLocalNotification,
  advanceLocalApplication,
  applicationStatuses,
  createLocalApplication,
  emptyLocalWorkflowState,
  normalizeLocalWorkflowState,
  type LocalApplication,
  type LocalNotification,
  type LocalWorkflowState
} from "@/lib/local-workflow";
import { getUnreadNotificationCount, markNotificationsRead } from "@/lib/notification-center";
import {
  getActiveInboxContact,
  getInboxContactKey,
  getInboxSelection,
  getNarrowMessagePane,
  mergeInboxContacts,
  type InboxContact
} from "@/lib/message-inbox";
import { buildSearchInsight } from "@/lib/search-insights";
import {
  getRoommateDeckCandidates,
  rankRoommatesByPreference,
  type RankedRoommate,
  type RoommateGender,
  type RoommatePreference,
  type SharedLivingGenderPreference
} from "@/lib/roommate-preferences";
import {
  canOpenRoommateDm,
  canSendRoommateIntro,
  getAccessibleRoommateDmId,
  getRoommateMatchStateAfterLike,
  getRoommateConnectionStatus,
  type RoommateConnectionState,
  type RoommateConnectionStatus
} from "@/lib/roommate-match-flow";
import { classifyRoommateQueue } from "@/lib/roommate-queue";
import {
  appendRoommateDmMessage,
  buildRoommateDmThread,
  buildStoredRoommateDmThread,
  getStoredRoommateDmThreads,
  type RoommateDmThread,
  type StoredRoommateDmThread
} from "@/lib/roommate-dm";
import {
  filterListingsByPrice,
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
};

type PublishDraft = {
  title: string;
  area: string;
  price: number;
  beds: number;
  baths: number;
};

type QueueItem = {
  id?: string;
  label: string;
  value: number;
  icon: LucideIcon;
  variant: "trust" | "warning" | "danger" | "success";
};

const seedListings: Listing[] = [];

const listingImages = [
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560448075-bb485b067938?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560448205-4d9b3e6bb6db?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1200&q=80"
];

const listingAreas = [
  "Los Angeles · Westwood",
  "Los Angeles · Koreatown",
  "Los Angeles · Culver City",
  "Los Angeles · Santa Monica",
  "Los Angeles · Silver Lake",
  "Los Angeles · Pasadena",
  "Los Angeles · DTLA",
  "Los Angeles · USC North",
  "Los Angeles · Hollywood",
  "Los Angeles · Burbank",
  "Los Angeles · Sawtelle",
  "Los Angeles · Glendale",
  "Los Angeles · Mar Vista",
  "Los Angeles · Echo Park",
  "Los Angeles · Playa Vista",
  "Los Angeles · North Hollywood",
  "Los Angeles · Los Feliz",
  "Los Angeles · Brentwood",
  "Los Angeles · Arts District",
  "Los Angeles · El Segundo"
];

const listingTitles = [
  "UCLA 步行圈阳光主卧",
  "地铁口 2B2B 合租",
  "实习通勤友好 1B1B",
  "海边 Studio 转租",
  "安静次卧短租",
  "Caltech 附近主卧",
  "高层 Loft",
  "3B2B Group 优选",
  "景观 1B",
  "影视实习友好次卧",
  "日系街区主卧",
  "安全小区 2B1B",
  "采光 Studio",
  "湖边合租房",
  "科技园 1B1B",
  "地铁旁 2B",
  "复古公寓主卧",
  "明亮 1B 转租",
  "工业风 Loft",
  "海边通勤 2B2B"
];

const listingTagSets = [
  ["独卫", "电梯", "可 8/20 入住"],
  ["整租", "宠物友好", "Group 推荐"],
  ["健身房", "门卫", "可短租"],
  ["近地铁", "洗烘", "视频验房"],
  ["无烟", "采光好", "房东知情"],
  ["带家具", "可做饭", "首日保障"]
];

const trustLabels = [
  ".edu 已认证 · 房东知情",
  "三方协议模板 · 视频验房",
  "企业邮箱认证 · 首日保障",
  "原租客高分 · 合同存证",
  "金牌转租人 · 低纠纷记录"
];

const commuteTargets = [
  "UCLA",
  "USC",
  "Santa Monica",
  "Culver City",
  "Caltech",
  "DTLA",
  "Burbank Studios",
  "Silicon Beach",
  "Hollywood",
  "LAX"
];

function createListings(): Listing[] {
  const generated = Array.from({ length: 100 }, (_, index) => {
    if (seedListings[index]) return seedListings[index];

    const area = listingAreas[index % listingAreas.length];
    const neighborhood = area.split(" · ")[1];
    const title = `${neighborhood} ${listingTitles[index % listingTitles.length]}`;
    const beds = (index % 4) + 1;
    const baths = Math.min(3, Math.max(1, beds - (index % 2)));
    const price = 980 + ((index * 137) % 3100);
    const originalPrice = price + 180 + ((index * 41) % 420);
    const commuteMinutes = 8 + ((index * 5) % 28);
    const transitMinutes = commuteMinutes + 6 + (index % 12);
    const target = commuteTargets[index % commuteTargets.length];

    return {
      id: String(index + 1),
      title,
      area,
      image: listingImages[index % listingImages.length],
      price,
      originalPrice,
      beds,
      baths,
      commute: `${index % 3 === 0 ? "步行" : index % 3 === 1 ? "轻轨" : "骑行"} ${commuteMinutes} 分钟到 ${target}`,
      transit: `公共交通 ${transitMinutes} 分钟 · ${neighborhood}`,
      trust: trustLabels[index % trustLabels.length],
      tags: listingTagSets[index % listingTagSets.length],
      score: Number((4.62 + ((index * 7) % 37) / 100).toFixed(2))
    };
  });

  return generated;
}

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
const seededLikedMeRoommateNames = new Set(["Mia Chen", "Grace Xu", "Olivia Park", "Ava Zhang"]);
const roommateMatchStorageKey = "sublet-roommate-match-flow-v1";
const roommateDmStorageKey = "sublet-roommate-dm-threads-v1";
const localWorkflowStorageKey = "sublet-pipeline-local-workflow-v1";

type StoredRoommateMatchState = {
  introSentIds: string[];
  likedByMeIds: string[];
  roommateMemberIds: string[];
};

const emptyStoredRoommateMatchState: StoredRoommateMatchState = {
  introSentIds: [],
  likedByMeIds: [],
  roommateMemberIds: []
};

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

const listings = createListings();
const roommates = createRoommates();

const navItems: Array<{ label: string; section: AppSection }> = [
  { label: "Stay", section: "Discover" },
  { label: "Roommates", section: "Roommates" },
  { label: "Messages", section: "Messages" },
  { label: "Trips", section: "Trips" },
  { label: "Publish", section: "Publish" },
  { label: "Trust", section: "Trust" }
];

const navIcons: Record<AppSection, LucideIcon> = {
  Discover: Home,
  ListingDetail: Home,
  Roommates: Users,
  LikeQueue: Heart,
  Messages: MessageCircle,
  Publish: DoorOpen,
  Trips: CalendarDays,
  Trust: ShieldCheck
};
const amenities = [
  { label: "Wi-Fi", icon: Wifi },
  { label: "独卫", icon: Bath },
  { label: "宠物", icon: PawPrint },
  { label: "近地铁", icon: TrainFront }
];

const defaultSearchFilters: SearchFilters = {
  query: "Los Angeles",
  checkIn: "2026-08-20",
  checkOut: "2026-11-30",
  priceMin: 0,
  priceMax: 4200,
  amenity: "Wi-Fi"
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
    score: listing.score
  };
}

function normalizeRoommate(roommate: ApiRoommate, index = 0): Roommate {
  return {
    id: roommate.id,
    name: roommate.name,
    age: roommate.age,
    role: roommate.role,
    image: roommate.image,
    match: roommate.match,
    budget: roommate.budget,
    commute: roommate.commute,
    gender: roommateGenders[index % roommateGenders.length],
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
    const key = roommate.id ?? roommate.name;
    if (seen.has(key)) return [];
    seen.add(key);

    return [roommate];
  });
}

function getRoommateKey(roommate: Roommate) {
  return roommate.name;
}

function getRoommateBudgetValue(roommate: Roommate) {
  return Number(roommate.budget.replace(/[^0-9]/g, "")) || 0;
}

function getSeededLikedMeRoommateIds(roommateProfiles: Roommate[]) {
  return new Set(
    roommateProfiles
      .filter((roommate) => seededLikedMeRoommateNames.has(roommate.name))
      .map(getRoommateKey)
  );
}

function normalizeStoredRoommateIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readStoredRoommateMatchState(): StoredRoommateMatchState {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return emptyStoredRoommateMatchState;

  try {
    const stored = window.localStorage.getItem(roommateMatchStorageKey);
    if (!stored) return emptyStoredRoommateMatchState;
    const parsed = JSON.parse(stored) as Partial<StoredRoommateMatchState>;

    return {
      introSentIds: normalizeStoredRoommateIds(parsed.introSentIds),
      likedByMeIds: normalizeStoredRoommateIds(parsed.likedByMeIds),
      roommateMemberIds: normalizeStoredRoommateIds(parsed.roommateMemberIds)
    };
  } catch {
    return emptyStoredRoommateMatchState;
  }
}

function writeStoredRoommateMatchState(state: StoredRoommateMatchState) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;

  try {
    window.localStorage.setItem(roommateMatchStorageKey, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in embedded browsers or private sessions.
  }
}

function readStoredRoommateDmThreads() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(roommateDmStorageKey);
    if (!stored) return {};
    const parsed = JSON.parse(stored);

    return getStoredRoommateDmThreads(parsed);
  } catch {
    return {};
  }
}

function writeStoredRoommateDmThreads(threads: Record<string, StoredRoommateDmThread>) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;

  try {
    window.localStorage.setItem(roommateDmStorageKey, JSON.stringify(Object.values(threads)));
  } catch {
    // Storage can be unavailable in embedded browsers or private sessions.
  }
}

function readStoredLocalWorkflow() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return emptyLocalWorkflowState;
  try {
    const stored = window.localStorage.getItem(localWorkflowStorageKey);
    return normalizeLocalWorkflowState(stored ? JSON.parse(stored) : null);
  } catch {
    return emptyLocalWorkflowState;
  }
}

function writeStoredLocalWorkflow(state: LocalWorkflowState) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(localWorkflowStorageKey, JSON.stringify(state));
  } catch {
    // Embedded and private browser sessions may deny storage.
  }
}

function haveSameRoommateKeys(left: Roommate[], right: Roommate[]) {
  if (left.length !== right.length) return false;
  return left.every((roommate, index) => getRoommateKey(roommate) === getRoommateKey(right[index]));
}

function matchesRoommatePreference(roommate: Roommate, preference: RoommatePreference) {
  const budget = getRoommateBudgetValue(roommate);
  const budgetFits = budget >= preference.budgetMin && budget <= preference.budgetMax;
  const genderFits =
    preference.gender === "Open" ||
    (preference.gender === "Women" && roommate.gender === "Woman") ||
    (preference.gender === "Men" && roommate.gender === "Man") ||
    (preference.gender === "Non-binary" && roommate.gender === "Non-binary");
  const schoolFits =
    preference.schools.length === 0 ||
    preference.schools.includes(roommate.school ?? "Other") ||
    preference.schools.some((school) => roommate.role.toLowerCase().includes(school.toLowerCase()));
  const hobbyFits =
    preference.hobbies.length === 0 ||
    preference.hobbies.some((hobby) => roommate.tags.includes(hobby));

  return budgetFits && genderFits && schoolFits && hobbyFits;
}

function getHostContactName(listing: Listing) {
  if (listing.area.includes("UCLA") || listing.area.includes("Westwood")) return "Maya";
  if (listing.area.includes("USC")) return "Jordan";
  if (listing.area.includes("Santa Monica")) return "Sofia";
  return "Alex";
}

function getDealParticipantNames(roommate: Roommate, groupMembers: Roommate[]) {
  const memberNames = groupMembers.map((member) => member.name);
  return Array.from(new Set([...memberNames, roommate.name, "You"]));
}

function buildThreadForListing(listing: Listing, roommate: Roommate, groupMembers: Roommate[]) {
  return buildInitialDealThread({
    listing,
    contactName: getHostContactName(listing),
    participantNames: getDealParticipantNames(roommate, groupMembers)
  });
}

function buildCreateThreadPayload(listing: Listing, roommate: Roommate, groupMembers: Roommate[], dealRoomId?: string) {
  return {
    listingId: listing.id,
    listingTitle: listing.title,
    area: listing.area,
    contactName: getHostContactName(listing),
    participantNames: getDealParticipantNames(roommate, groupMembers),
    ...(dealRoomId ? { dealRoomId } : {})
  };
}

function apiThreadToDealThread(apiThread: ApiDealThread, fallback: DealThread): DealThread {
  const messages =
    apiThread.messages.length > 0
      ? apiThread.messages.map((message) => ({
          id: message.id,
          author: message.senderName,
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
    participants: Array.from(new Set([apiThread.contactName, ...apiThread.participantNames])),
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
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function HomePage({
  initialSection,
  initialMessageListingId,
  initialRoommateDmId,
  initialListingId,
  initialGroupTourSelecting = false,
  initialAuthPanelOpen = false
}: {
  initialSection?: AppSection;
  initialMessageListingId?: string | null;
  initialRoommateDmId?: string | null;
  initialListingId?: string | null;
  initialGroupTourSelecting?: boolean;
  initialAuthPanelOpen?: boolean;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const startingSection = initialListingId
    ? sectionForRoute(pathname, { listingId: initialListingId })
    : initialSection ?? sectionForRoute(pathname);
  const initialSelectedListing = listings.find((listing) => listing.id === initialListingId) ?? listings[0];
  const [allListings, setAllListings] = useState(listings);
  const [selectedListing, setSelectedListing] = useState(initialSelectedListing);
  const [apiRoommates, setApiRoommates] = useState<Roommate[]>(roommates);
  const [apiTrips, setApiTrips] = useState<ApiTrip[]>([]);
  const [apiTrustQueues, setApiTrustQueues] = useState<ApiTrustQueue[]>([]);
  const [roommateIndex, setRoommateIndex] = useState(0);
  const [activeSection, setActiveSection] = useState<AppSection>(startingSection);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [savedOnly, setSavedOnly] = useState(false);
  const [groupTourSelecting, setGroupTourSelecting] = useState(initialGroupTourSelecting);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(defaultSearchFilters);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set(["1"]));
  const [contactedListingIds, setContactedListingIds] = useState<Set<string>>(
    () => new Set(initialMessageListingId ? [initialMessageListingId] : [])
  );
  const [tourRequestedListingIds, setTourRequestedListingIds] = useState<Set<string>>(new Set());
  const [dealThreads, setDealThreads] = useState<Record<string, DealThread>>({});
  const [viewingRequests, setViewingRequests] = useState<ViewingRequest[]>([]);
  const [applications, setApplications] = useState<LocalApplication[]>([]);
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [localWorkflowHydrated, setLocalWorkflowHydrated] = useState(false);
  const [activeMessageListingId, setActiveMessageListingId] = useState<string | null>(initialMessageListingId ?? null);
  const [appliedListingId, setAppliedListingId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Roommate[]>([]);
  const [activeRoommateDmId, setActiveRoommateDmId] = useState<string | null>(initialRoommateDmId ?? null);
  const [roommateDmThreads, setRoommateDmThreads] = useState<Record<string, StoredRoommateDmThread>>({});
  const [roommateDmStorageHydrated, setRoommateDmStorageHydrated] = useState(false);
  const [likedRoommateIds, setLikedRoommateIds] = useState<Set<string>>(new Set());
  const [likedMeRoommateIds, setLikedMeRoommateIds] = useState<Set<string>>(
    () => getSeededLikedMeRoommateIds(roommates)
  );
  const [introSentRoommateIds, setIntroSentRoommateIds] = useState<Set<string>>(new Set());
  const [storedRoommateMemberIds, setStoredRoommateMemberIds] = useState<Set<string>>(new Set());
  const [roommateStorageHydrated, setRoommateStorageHydrated] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [tourRequested, setTourRequested] = useState(false);
  const [toast, setToast] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [authPanelOpen, setAuthPanelOpen] = useState(initialAuthPanelOpen);
  const [activeDealRoomId, setActiveDealRoomId] = useState<string | null>(null);
  const [myListings, setMyListings] = useState<ApiListing[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    const storedSession = readStoredAuthSession();
    if (storedSession) setToken(storedSession.accessToken);
  }, []);

  useEffect(() => {
    const stored = readStoredLocalWorkflow();
    setFavoriteIds(new Set(stored.favoriteListingIds));
    setContactedListingIds(new Set(stored.contactedListingIds));
    setDealThreads(stored.dealThreads);
    setViewingRequests(stored.viewingRequests);
    setApplications(stored.applications);
    const storedListingId = stored.applications[0]?.listingId ?? stored.viewingRequests[0]?.listingId;
    if (!initialListingId && storedListingId) {
      setSelectedListing(listings.find((listing) => listing.id === storedListingId) ?? listings[0]);
    }
    setNotifications(stored.notifications);
    setLocalWorkflowHydrated(true);
  }, [initialListingId]);

  useEffect(() => {
    if (initialRoommateDmId) {
      selectInboxTarget({ kind: "roommate", targetId: initialRoommateDmId });
      return;
    }

    if (initialMessageListingId) {
      selectInboxTarget({ kind: "listing", targetId: initialMessageListingId });
      return;
    }

    setActiveMessageListingId(null);
    setActiveRoommateDmId(null);
  }, [initialMessageListingId, initialRoommateDmId]);

  useEffect(() => {
    setActiveSection(sectionForRoute(pathname, { listingId: initialListingId }));
  }, [initialListingId, pathname]);

  useEffect(() => {
    if (!localWorkflowHydrated) return;
    writeStoredLocalWorkflow({
      version: 1,
      favoriteListingIds: Array.from(favoriteIds),
      contactedListingIds: Array.from(contactedListingIds),
      dealThreads,
      viewingRequests,
      applications,
      notifications
    });
  }, [applications, contactedListingIds, dealThreads, favoriteIds, localWorkflowHydrated, notifications, viewingRequests]);

  useEffect(() => {
    const storedRoommateState = readStoredRoommateMatchState();
    setLikedRoommateIds(new Set(storedRoommateState.likedByMeIds));
    setIntroSentRoommateIds(new Set(storedRoommateState.introSentIds));
    setStoredRoommateMemberIds(new Set(storedRoommateState.roommateMemberIds));
    setGroupMembers(roommates.filter((candidate) => storedRoommateState.roommateMemberIds.includes(getRoommateKey(candidate))));
    setRoommateStorageHydrated(true);
  }, []);

  useEffect(() => {
    setRoommateDmThreads(readStoredRoommateDmThreads());
    setRoommateDmStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!roommateDmStorageHydrated) return;
    writeStoredRoommateDmThreads(roommateDmThreads);
  }, [roommateDmStorageHydrated, roommateDmThreads]);

  useEffect(() => {
    if (!roommateStorageHydrated) return;

    writeStoredRoommateMatchState({
      introSentIds: Array.from(introSentRoommateIds),
      likedByMeIds: Array.from(likedRoommateIds),
      roommateMemberIds: groupMembers.map(getRoommateKey)
    });
  }, [groupMembers, introSentRoommateIds, likedRoommateIds, roommateStorageHydrated]);

  useEffect(() => {
    if (!roommateStorageHydrated || storedRoommateMemberIds.size === 0) return;

    const storedMembers = apiRoommates.filter((candidate) => storedRoommateMemberIds.has(getRoommateKey(candidate)));
    if (storedMembers.length === 0) return;

    setGroupMembers((current) => {
      const remainingMembers = current.filter((member) => !storedRoommateMemberIds.has(getRoommateKey(member)));
      const nextMembers = [...remainingMembers, ...storedMembers].slice(-4);
      return haveSameRoommateKeys(current, nextMembers) ? current : nextMembers;
    });
  }, [apiRoommates, roommateStorageHydrated, storedRoommateMemberIds]);

  useEffect(() => {
    async function loadApiData() {
      try {
        const [apiListings, apiRoommateData, apiTripData, apiQueueData] =
          await Promise.all([
            apiGet<ApiListing[]>("/listings"),
            apiGet<ApiRoommate[]>("/roommates"),
            apiGet<ApiTrip[]>("/trips"),
            apiGet<ApiTrustQueue[]>("/trust/queues")
          ]);

        const normalizedListings = apiListings.map(normalizeListing);
        const normalizedListingIds = new Set(normalizedListings.map((listing) => listing.id));
        const hydratedListings =
          normalizedListings.length >= 100
            ? normalizedListings
            : [
                ...normalizedListings,
                ...listings
                  .filter((listing) => !normalizedListingIds.has(listing.id))
                  .slice(0, 100 - normalizedListings.length)
              ];
        const normalizedRoommates = apiRoommateData.map((apiRoommate, index) => normalizeRoommate(apiRoommate, index));
        setAllListings(hydratedListings);
        setSelectedListing((current) => hydratedListings.find((listing) => listing.id === current.id) ?? hydratedListings[0] ?? current);
        setApiRoommates(normalizedRoommates);
        setLikedMeRoommateIds((current) => new Set([...Array.from(current), ...Array.from(getSeededLikedMeRoommateIds(normalizedRoommates))]));
        setApiTrips(apiTripData);
        setApiTrustQueues(apiQueueData);
        setApiError(null);
        setToast("已从后端 API 加载数据");
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "后端 API 不可用");
      }
    }

    void loadApiData();
  }, []);

  useEffect(() => {
    async function loadMe() {
      if (!token) return;
      try {
        const [currentUser, currentProfile] = await Promise.all([
          getSessionUser(token),
          getMyProfile(token)
        ]);
        setUser(currentUser);
        setProfile(currentProfile);
      } catch {
        clearStoredAuthSession();
        setToken(null);
        setUser(null);
        setProfile(null);
      }
    }

    void loadMe();
  }, [token]);

  useEffect(() => {
    async function loadAuthenticatedWorkspace() {
      if (!token) {
        setMyListings([]);
        setActiveDealRoomId(null);
        return;
      }

      try {
        const [ownedListings, dealRooms, apiDealThreads] = await Promise.all([
          apiGet<ApiListing[]>("/listings/mine", token),
          apiGet<ApiDealRoom[]>("/deal-rooms/active", token),
          apiGet<ApiDealThread[]>("/deal-threads", token)
        ]);
        const sortedListings = sortOwnerListings(
          ownedListings.filter((listing): listing is ApiListing & { status: ListingStatus } => Boolean(listing.status))
        );
        const dealRoomMembers = getRoommatesFromDealRooms(dealRooms);
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

        setMyListings(sortedListings);
        setActiveDealRoomId(dealRooms[0]?.id ?? null);
        setLikedRoommateIds((current) => new Set([...Array.from(current), ...dealRoomMembers.map(getRoommateKey)]));
        if (dealRoomMembers.length > 0) {
          setGroupMembers(dealRoomMembers.slice(-4));
          setStoredRoommateMemberIds((current) => new Set([...Array.from(current), ...dealRoomMembers.map(getRoommateKey)]));
        }
        setTourRequested(dealRooms.some((room) => room.tourRequest?.status === "REQUESTED"));
        setDealThreads(nextThreads);
        setViewingRequests(nextViewingRequests);
        setContactedListingIds(new Set(apiDealThreads.map((thread) => thread.listingId)));
        setTourRequestedListingIds(new Set(nextViewingRequests.map((request) => request.listingId)));
      } catch (error) {
        setToast(error instanceof Error ? error.message : "登录工作台加载失败");
      }
    }

    void loadAuthenticatedWorkspace();
  }, [token]);

  const roommate = apiRoommates[roommateIndex] ?? apiRoommates[0] ?? roommates[0];
  const roommateMemberIds = useMemo(() => new Set(groupMembers.map(getRoommateKey)), [groupMembers]);
  const roommateConnectionState = useMemo<RoommateConnectionState>(
    () => ({
      likedByMeIds: likedRoommateIds,
      likedMeIds: likedMeRoommateIds,
      introSentIds: introSentRoommateIds,
      roommateIds: roommateMemberIds
    }),
    [introSentRoommateIds, likedMeRoommateIds, likedRoommateIds, roommateMemberIds]
  );
  const canRequestTour = groupMembers.length > 0;
  const filteredListings = useMemo(
    () =>
      allListings.filter((listing) => {
        const query = filters.query.trim().toLowerCase();
        const haystack = [
          listing.title,
          listing.area,
          listing.commute,
          listing.transit,
          listing.trust,
          ...listing.tags
        ]
          .join(" ")
          .toLowerCase();
        const matchesQuery = !query || haystack.includes(query) || query === "la";
        const matchesPrice = filterListingsByPrice([listing], filters).length > 0;
        const matchesAmenity =
          filters.amenity === "Wi-Fi" ||
          haystack.includes(filters.amenity.toLowerCase()) ||
          (filters.amenity === "独卫" && (listing.baths > 1 || listing.tags.includes("独卫"))) ||
          (filters.amenity === "宠物" && listing.tags.some((tag) => tag.includes("宠物"))) ||
          (filters.amenity === "近地铁" && (listing.transit.includes("地铁") || listing.tags.includes("近地铁")));

        return matchesQuery && matchesPrice && matchesAmenity;
      }),
    [allListings, filters]
  );
  const visibleListings = filterSavedListings(filteredListings, favoriteIds, savedOnly);
  const visibleSelectedListing = getVisibleSelectedListing(selectedListing, visibleListings);
  const viewingSlots = useMemo(
    () => buildViewingSlots(filters.checkIn || defaultSearchFilters.checkIn),
    [filters.checkIn]
  );
  const selectedDealThread = useMemo(
    () => dealThreads[selectedListing.id] ?? buildThreadForListing(selectedListing, roommate, groupMembers),
    [dealThreads, groupMembers, roommate, selectedListing]
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
  const messageRoommates = useMemo(
    () => apiRoommates.filter((candidate) => canOpenRoommateDm(getRoommateKey(candidate), roommateConnectionState)),
    [apiRoommates, roommateConnectionState]
  );
  const listingInboxContacts = useMemo<InboxContact[]>(
    () =>
      messageListings.map((listing) => {
        const thread = dealThreads[listing.id] ?? buildThreadForListing(listing, roommate, groupMembers);
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
    [dealThreads, groupMembers, messageListings, roommate]
  );
  const roommateInboxContacts = useMemo<InboxContact[]>(
    () =>
      messageRoommates.map((candidate) => {
        const targetKey = getRoommateKey(candidate);
        const thread = buildRoommateDmThread({
          roommateId: targetKey,
          roommateName: candidate.name,
          roommateRole: candidate.role,
          storedMessages: roommateDmThreads[targetKey]?.messages,
          lastActivityAt: roommateDmThreads[targetKey]?.lastActivityAt
        });
        const latestMessage = thread.messages.at(-1);

        return {
          kind: "roommate",
          targetId: targetKey,
          contactName: candidate.name,
          contextLabel: candidate.role,
          preview: latestMessage?.body ?? "Roommate DM",
          time: latestMessage?.time ?? "",
          image: candidate.image,
          activityOrder: thread.lastActivityAt
        };
      }),
    [messageRoommates, roommateDmThreads]
  );
  const inboxContacts = useMemo(
    () => mergeInboxContacts(listingInboxContacts, roommateInboxContacts),
    [listingInboxContacts, roommateInboxContacts]
  );
  const requestedInboxTarget = useMemo(
    () => {
      const accessibleRoommateDmId = roommateStorageHydrated
        ? getAccessibleRoommateDmId(activeRoommateDmId, roommateConnectionState)
        : null;

      return accessibleRoommateDmId
        ? { kind: "roommate" as const, targetId: accessibleRoommateDmId }
        : activeMessageListingId
          ? { kind: "listing" as const, targetId: activeMessageListingId }
          : null;
    },
    [activeMessageListingId, activeRoommateDmId, roommateConnectionState, roommateStorageHydrated]
  );
  const routeInboxTarget = activeRoommateDmId
    ? { kind: "roommate" as const, targetId: activeRoommateDmId }
    : activeMessageListingId
      ? { kind: "listing" as const, targetId: activeMessageListingId }
      : null;
  const narrowMessagePane = getNarrowMessagePane(routeInboxTarget);
  const requestedInboxKey = routeInboxTarget ? getInboxContactKey(routeInboxTarget) : null;
  const activeInboxContact = useMemo(
    () => getActiveInboxContact(inboxContacts, requestedInboxTarget),
    [inboxContacts, requestedInboxTarget]
  );
  const activeMessageListing = useMemo(
    () =>
      activeInboxContact?.kind === "listing"
        ? messageListings.find((listing) => listing.id === activeInboxContact.targetId) ?? null
        : null,
    [activeInboxContact, messageListings]
  );
  const activeRoommateDm = useMemo(
    () =>
      activeInboxContact?.kind === "roommate"
        ? messageRoommates.find((candidate) => getRoommateKey(candidate) === activeInboxContact.targetId) ?? null
        : null,
    [activeInboxContact, messageRoommates]
  );
  const activeRoommateDmThread = useMemo<RoommateDmThread | null>(() => {
    if (!activeRoommateDm) return null;

    const targetKey = getRoommateKey(activeRoommateDm);
    return buildRoommateDmThread({
      roommateId: targetKey,
      roommateName: activeRoommateDm.name,
      roommateRole: activeRoommateDm.role,
      storedMessages: roommateDmThreads[targetKey]?.messages,
      lastActivityAt: roommateDmThreads[targetKey]?.lastActivityAt
    });
  }, [activeRoommateDm, roommateDmThreads]);
  const activeMessageThread = useMemo(
    () =>
      activeMessageListing
        ? dealThreads[activeMessageListing.id] ?? buildThreadForListing(activeMessageListing, roommate, groupMembers)
        : null,
    [activeMessageListing, dealThreads, groupMembers, roommate]
  );
  const activeMessageViewingRequest = useMemo(
    () => (activeMessageListing ? getLatestViewingRequest(activeMessageListing.id, viewingRequests) : null),
    [activeMessageListing, viewingRequests]
  );
  const activeMessageStage = useMemo(
    () => (activeMessageThread ? getDealWorkflowStage(activeMessageThread, viewingRequests) : "Inbox empty"),
    [activeMessageThread, viewingRequests]
  );

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, [activeSection, requestedInboxKey]);

  function navigateToSection(section: AppSection) {
    setActiveSection(section);
    const route = routeForSection(section);
    if (route !== pathname) router.push(route);
  }

  function handleSelectInboxContact(contact: InboxContact) {
    selectInboxTarget({ kind: contact.kind, targetId: contact.targetId });

    setActiveSection("Messages");
    router.push(dmRouteForTarget({ kind: contact.kind, id: contact.targetId }));
  }

  function handleBackToMessageContacts() {
    setActiveMessageListingId(null);
    setActiveRoommateDmId(null);
    setActiveSection("Messages");
    router.push("/messages");
  }

  function selectInboxTarget(target: { kind: "listing" | "roommate"; targetId: string }) {
    const selection = getInboxSelection(target);
    setActiveMessageListingId(selection.activeMessageListingId);
    setActiveRoommateDmId(selection.activeRoommateDmId);
  }

  function cycleRoommate(direction: 1 | -1) {
    setRoommateIndex((current) => {
      const next = current + direction;
      if (next < 0) return apiRoommates.length - 1;
      if (next >= apiRoommates.length) return 0;
      return next;
    });
  }

  function handleAmenityChange(amenity: string) {
    setFilters((current) => ({ ...current, amenity }));
    setToast(`已筛选设施：${amenity}`);
  }

  function handleFavorite(listingId: string) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(listingId)) {
        next.delete(listingId);
        setToast("已取消收藏");
      } else {
        next.add(listingId);
        setToast("已加入收藏");
      }
      return next;
    });
  }

  function openListingDetail(listing: Listing) {
    setSelectedListing(listing);
    setActiveSection("ListingDetail");
    router.push(listingDetailRoute(listing.id));
    setToast(`正在查看房源详情：${listing.title}`);
  }

  async function handleContactListing(listing: Listing, options: { tour?: boolean } = {}) {
    setSelectedListing(listing);
    selectInboxTarget({ kind: "listing", targetId: listing.id });
    router.push(dmRouteForTarget({ kind: "listing", id: listing.id }, options));
    setActiveSection("Messages");
    setContactedListingIds((current) => new Set(current).add(listing.id));
    const fallbackThread = buildThreadForListing(listing, roommate, groupMembers);
    setDealThreads((current) => ({
      ...current,
      [listing.id]: current[listing.id] ?? fallbackThread
    }));

    if (token) {
      try {
        const apiThread = await apiPost<ApiDealThread>(
          "/deal-threads",
          buildCreateThreadPayload(listing, roommate, groupMembers, activeDealRoomId ?? undefined),
          token
        );
        setDealThreads((current) => ({
          ...current,
          [listing.id]: apiThreadToDealThread(apiThread, current[listing.id] ?? fallbackThread)
        }));
        setViewingRequests((current) => [
          ...current.filter((request) => request.listingId !== listing.id),
          ...apiThread.viewingRequests.map(apiViewingRequestToViewingRequest)
        ]);
      } catch (error) {
        setToast(error instanceof Error ? `Messages 已本地打开，后端同步失败：${error.message}` : "Messages 已本地打开，后端同步失败");
        return;
      }
    }

    setToast(`已打开 ${listing.title} 的 Messages`);
  }

  async function ensureRemoteDealThread(listing: Listing, options: { syncLocal?: boolean } = {}) {
    if (!token) return null;

    const syncLocal = options.syncLocal ?? true;
    const fallbackThread = dealThreads[listing.id] ?? buildThreadForListing(listing, roommate, groupMembers);
    const apiThread = await apiPost<ApiDealThread>(
      "/deal-threads",
      buildCreateThreadPayload(listing, roommate, groupMembers, activeDealRoomId ?? undefined),
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
    setSelectedListing(listing);
    selectInboxTarget({ kind: "listing", targetId: listing.id });
    setContactedListingIds((current) => new Set(current).add(listing.id));
    setDealThreads((current) => {
      const thread = current[listing.id] ?? buildThreadForListing(listing, roommate, groupMembers);
      return {
        ...current,
        [listing.id]: appendDealMessage(thread, {
          body,
          now: new Date(),
          senderName: "You"
        })
      };
    });
    setNotifications((current) => addLocalNotification(current, {
      id: `dm-${listing.id}-${Date.now()}`,
      kind: "dm",
      title: `已发送给 ${getHostContactName(listing)}`,
      detail: listing.title,
      createdAt: Date.now(),
      read: false
    }));

    if (token) {
      try {
        const apiThread = await ensureRemoteDealThread(listing, { syncLocal: false });
        if (apiThread) {
          const updatedThread = await apiPost<ApiDealThread>(
            `/deal-threads/${apiThread.id}/messages`,
            { body },
            token
          );
          const fallbackThread = dealThreads[listing.id] ?? buildThreadForListing(listing, roommate, groupMembers);
          setDealThreads((current) => ({
            ...current,
            [listing.id]: apiThreadToDealThread(updatedThread, current[listing.id] ?? fallbackThread)
          }));
        }
      } catch (error) {
        setToast(error instanceof Error ? `DM 已本地发送，后端同步失败：${error.message}` : "DM 已本地发送，后端同步失败");
        return;
      }
    }

    setToast("DM 已发送");
  }

  async function handleRequestListingTour(listing: Listing, slot = viewingSlots[0]) {
    if (!slot) {
      setToast("暂无可预约时间");
      return;
    }

    const participantNames = getDealParticipantNames(roommate, groupMembers);
    const hasExistingActiveRequest = viewingRequests.some(
      (item) => item.listingId === listing.id && item.status !== "COMPLETED" && item.status !== "CANCELLED"
    );
    const request = createViewingRequest({
      listing,
      participantNames,
      previousCount: viewingRequests.filter((item) => item.listingId === listing.id).length,
      slot
    });

    setSelectedListing(listing);
    selectInboxTarget({ kind: "listing", targetId: listing.id });
    setContactedListingIds((current) => new Set(current).add(listing.id));
    setTourRequestedListingIds((current) => new Set(current).add(listing.id));
    setViewingRequests((current) => upsertViewingRequest(current, request));
    setDealThreads((current) => {
      const thread = current[listing.id] ?? buildThreadForListing(listing, roommate, groupMembers);
      return {
        ...current,
        [listing.id]: appendDealMessage(thread, {
          body: `我想${hasExistingActiveRequest ? "调整看房到" : "预约"} ${request.timeLabel} 的${request.mode === "video" ? "视频" : "线下"}看房，参与人：${participantNames.join(", ")}。`,
          now: new Date(),
          senderName: "You"
        })
      };
    });
    setNotifications((current) => addLocalNotification(current, {
      id: `tour-${listing.id}`,
      kind: "tour",
      title: hasExistingActiveRequest ? "看房时间已调整" : "看房请求已创建",
      detail: `${listing.title} · ${request.timeLabel}`,
      createdAt: Date.now(),
      read: false
    }));

    if (token) {
      try {
        const apiThread = await ensureRemoteDealThread(listing, { syncLocal: false });
        if (apiThread) {
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
          const fallbackThread = dealThreads[listing.id] ?? buildThreadForListing(listing, roommate, groupMembers);
          setDealThreads((current) => ({
            ...current,
            [listing.id]: apiThreadToDealThread(updatedThread, current[listing.id] ?? fallbackThread)
          }));
          setViewingRequests((current) => [
            ...current.filter((item) => item.listingId !== listing.id),
            ...updatedThread.viewingRequests.map(apiViewingRequestToViewingRequest)
          ]);
        }
      } catch (error) {
        setToast(error instanceof Error ? `看房已本地预约，后端同步失败：${error.message}` : "看房已本地预约，后端同步失败");
        return;
      }
    }

    setToast(`已预约看房：${listing.title} · ${slot.label}`);
  }

  function handleStartApplication(listing: Listing) {
    const now = new Date();
    setApplications((current) => createLocalApplication(current, {
      listingId: listing.id,
      listingTitle: listing.title,
      now
    }));
    setAppliedListingId(listing.id);
    setSelectedListing(listing);
    setNotifications((current) => addLocalNotification(current, {
      id: `application-${listing.id}`,
      kind: "application",
      title: "申请已创建",
      detail: listing.title,
      createdAt: now.getTime(),
      read: false
    }));
    navigateToSection("Trips");
    setToast(`已为 ${listing.title} 开始申请流程`);
  }

  async function handleAcceptRoommate(targetRoommate = roommate) {
    const targetKey = getRoommateKey(targetRoommate);
    const nextStoredMatchState = getRoommateMatchStateAfterLike(targetKey, {
      likedByMeIds: likedRoommateIds,
      introSentIds: introSentRoommateIds,
      roommateIds: groupMembers.map(getRoommateKey)
    });
    setLikedRoommateIds(new Set(nextStoredMatchState.likedByMeIds));
    writeStoredRoommateMatchState(nextStoredMatchState);
    setTourRequested(false);
    const matchedBack = likedMeRoommateIds.has(targetKey);
    if (matchedBack) {
      setRoommateDmThreads((current) => ({
        ...current,
        [targetKey]:
          current[targetKey] ??
          buildStoredRoommateDmThread({
            roommateId: targetKey,
            roommateName: targetRoommate.name,
            roommateRole: targetRoommate.role
          })
      }));
      selectInboxTarget({ kind: "roommate", targetId: targetKey });
      router.push(dmRouteForTarget({ kind: "roommate", id: targetKey }));
      setActiveSection("Messages");
    }

    if (!token || !targetRoommate.id) {
      setToast(
        matchedBack
          ? `你和 ${targetRoommate.name} 互相 Like 了，私信已解锁`
          : `${targetRoommate.name} 已加入 Liked by me，等对方 Like 回来后解锁私信`
      );
      return;
    }

    try {
      const response = await apiPost<ApiRoommateActionResponse>(
        `/roommates/${targetRoommate.id}/actions`,
        { action: "LIKE" },
        token
      );
      if (matchedBack) setActiveDealRoomId(response.dealRoom?.id ?? null);
      setToast(
        matchedBack
          ? `你和 ${targetRoommate.name} 互相 Like 了，私信已解锁`
          : `${targetRoommate.name} 已加入 Liked by me，等对方 Like 回来后解锁私信`
      );
    } catch (error) {
      setToast(error instanceof Error ? `本地已匹配，后端同步失败：${error.message}` : "本地已匹配，后端同步失败");
    }
  }

  function handleSendRoommateIntro(targetRoommate: Roommate) {
    const targetKey = getRoommateKey(targetRoommate);
    if (!canSendRoommateIntro(targetKey, roommateConnectionState)) {
      setToast(`${targetRoommate.name} 的 opening message 已经发过，互相 Like 后才能继续私信`);
      return;
    }

    setIntroSentRoommateIds((current) => new Set(current).add(targetKey));
    setToast(`已给 ${targetRoommate.name} 发送一条 opening message`);
  }

  function handleOpenRoommateDm(targetRoommate: Roommate) {
    const targetKey = getRoommateKey(targetRoommate);
    if (!canOpenRoommateDm(targetKey, roommateConnectionState)) {
      setToast(`先互相 Like，才能解锁 ${targetRoommate.name} 的私信`);
      return;
    }

    setRoommateDmThreads((current) => ({
      ...current,
      [targetKey]:
        current[targetKey] ??
        buildStoredRoommateDmThread({
          roommateId: targetKey,
          roommateName: targetRoommate.name,
          roommateRole: targetRoommate.role
        })
    }));
    selectInboxTarget({ kind: "roommate", targetId: targetKey });
    router.push(dmRouteForTarget({ kind: "roommate", id: targetKey }));
    setActiveSection("Messages");
    setToast(`${targetRoommate.name} 的室友私信已打开`);
  }

  function handleSendRoommateDm(targetRoommate: Roommate, body: string) {
    const targetKey = getRoommateKey(targetRoommate);
    if (!canOpenRoommateDm(targetKey, roommateConnectionState)) {
      setToast(`先互相 Like，才能给 ${targetRoommate.name} 发送私信`);
      return;
    }

    setRoommateDmThreads((current) => {
      const baseThread = buildRoommateDmThread({
        roommateId: targetKey,
        roommateName: targetRoommate.name,
        roommateRole: targetRoommate.role,
        storedMessages: current[targetKey]?.messages,
        lastActivityAt: current[targetKey]?.lastActivityAt
      });
      const nextThread = appendRoommateDmMessage(baseThread, {
        body,
        now: new Date()
      });

      return {
        ...current,
        [targetKey]: {
          roommateId: targetKey,
          messages: nextThread.messages,
          lastActivityAt: nextThread.lastActivityAt
        }
      };
    });
    selectInboxTarget({ kind: "roommate", targetId: targetKey });
    setToast("Roommate DM 已保存到本地 Demo");
  }

  async function handleDecideRoommate(targetRoommate: Roommate) {
    const targetKey = getRoommateKey(targetRoommate);
    if (!canOpenRoommateDm(targetKey, roommateConnectionState)) {
      setToast(`先和 ${targetRoommate.name} 互相 Like，再决定是否当室友`);
      return;
    }

    setGroupMembers((current) => {
      if (current.some((member) => getRoommateKey(member) === targetKey)) return current;
      return [...current, targetRoommate].slice(-4);
    });
    setStoredRoommateMemberIds((current) => new Set(current).add(targetKey));
    setTourRequested(false);

    if (token && targetRoommate.id) {
      try {
        const response = await apiPost<ApiRoommateActionResponse>(
          `/roommates/${targetRoommate.id}/actions`,
          { action: "LIKE" },
          token
        );
        setActiveDealRoomId(response.dealRoom?.id ?? activeDealRoomId);
      } catch (error) {
        setToast(error instanceof Error ? `已本地加入室友，后端同步失败：${error.message}` : "已本地加入室友，后端同步失败");
        return;
      }
    }

    setToast(`${targetRoommate.name} 已加入室友组，现在可以一起预约 group tour`);
  }

  async function handleRejectRoommate(targetRoommate = roommate) {
    const rejectedRoommate = targetRoommate;
    setSkippedCount((current) => current + 1);
    setTourRequested(false);
    setToast(`已跳过 ${rejectedRoommate.name}`);
    cycleRoommate(1);

    if (!token || !rejectedRoommate.id) return;

    try {
      await apiPost(`/roommates/${rejectedRoommate.id}/actions`, { action: "PASS" }, token);
    } catch (error) {
      setToast(error instanceof Error ? `跳过已保留，本地同步成功；后端失败：${error.message}` : "跳过已保留，本地同步成功；后端失败");
    }
  }

  async function handleLaterRoommate(targetRoommate = roommate) {
    const laterRoommate = targetRoommate;
    setTourRequested(false);
    setToast(`${laterRoommate.name} 已放入稍后查看`);
    cycleRoommate(1);

    if (!token || !laterRoommate.id) return;

    try {
      await apiPost(`/roommates/${laterRoommate.id}/actions`, { action: "LATER" }, token);
    } catch (error) {
      setToast(error instanceof Error ? `稍后查看已保留，本地同步成功；后端失败：${error.message}` : "稍后查看已保留，本地同步成功；后端失败");
    }
  }

  async function handleRequestGroupTour() {
    if (!canRequestTour) {
      setToast("先互相 Like，并决定成为室友后，才能发起 Group Tour");
      return;
    }

    setGroupTourSelecting(true);
    setSavedOnly(false);
    setActiveSection("Discover");
    router.push(discoverRouteForIntent({ groupTour: true }));
    setToast("请选择一套房源，再到 Messages 明确选择 Group Tour 时间");
  }

  async function handleCreateListing(draft: PublishDraft) {
    if (!token) {
      setToast("请先用邮箱验证码登录，再发布房源");
      setAuthPanelOpen(true);
      return;
    }

    setIsPublishing(true);
    const payload = {
      title: draft.title,
      area: draft.area,
      image: listingImages[allListings.length % listingImages.length],
      price: draft.price,
      originalPrice: draft.price + 320,
      beds: draft.beds,
      baths: draft.baths,
      commute: "步行 15 分钟到 UCLA",
      transit: "地铁 22 分钟 · 新发布房源",
      trust: "房东知情 · 待审核",
      tags: ["新发布", "视频验房", "房东知情"],
      score: 4.8
    };

    try {
      const createdListing = await apiPost<ApiListing>("/listings", payload, token);

      try {
        await apiPost<ApiListing>(`/listings/${createdListing.id}/submit`, {}, token);
        setToast(`${draft.title} 已创建并提交审核`);
      } catch (error) {
        setToast(error instanceof Error ? `${draft.title} 已创建为草稿，提交审核失败：${error.message}` : `${draft.title} 已创建为草稿，提交审核失败`);
      }

      const ownedListings = await apiGet<ApiListing[]>("/listings/mine", token);
      setMyListings(
        sortOwnerListings(
          ownedListings.filter((listing): listing is ApiListing & { status: ListingStatus } => Boolean(listing.status))
        )
      );
      navigateToSection("Publish");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "房源创建失败");
    } finally {
      setIsPublishing(false);
    }
  }

  function advanceEscrow(applicationId: string) {
    setApplications((current) => advanceLocalApplication(current, applicationId));
    setNotifications((current) => addLocalNotification(current, {
      id: `escrow-${applicationId}-${Date.now()}`,
      kind: "escrow",
      title: "交易状态已更新",
      detail: "可在 Trips 查看最新托管进度",
      createdAt: Date.now(),
      read: false
    }));
    setToast("交易托管状态已更新");
  }

  function handleAuthenticated(accessToken: string, nextUser: SessionUser) {
    writeStoredAuthSession(accessToken);
    setToken(accessToken);
    setUser(nextUser);
    setAuthPanelOpen(true);
  }

  function handleLogout() {
    clearStoredAuthSession();
    setToken(null);
    setUser(null);
    setProfile(null);
    setAuthPanelOpen(false);
    setToast("已退出登录");
  }

  async function handleSaveProfile(draft: UpdateProfileInput) {
    if (!token) {
      setToast("请先登录再完善资料");
      setAuthPanelOpen(true);
      return;
    }

    try {
      const updatedProfile = await updateMyProfile(token, draft);
      setProfile(updatedProfile);
      setToast("资料已保存");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "资料保存失败");
    }
  }

  const showAuthStrip = activeSection === "Publish" || authPanelOpen || pathname.startsWith("/account");

  return (
    <main className="min-h-screen bg-background">
      <AppHeader
        favoriteCount={favoriteIds.size}
        savedOnly={savedOnly}
        notifications={notifications}
        notificationsOpen={notificationsOpen}
        activeSection={activeSection}
        onSectionChange={navigateToSection}
        onSavedHomes={() => {
          setSavedOnly((current) => !current);
          setActiveSection("Discover");
          router.push("/");
        }}
        onNotifications={() => {
          setNotificationsOpen((current) => !current);
          setNotifications((current) => markNotificationsRead(current));
        }}
        user={user}
        profile={profile}
        onAuthOpen={() => {
          setAuthPanelOpen(true);
          if (!pathname.startsWith("/account")) router.push("/account");
        }}
        onLogout={handleLogout}
      />
      {showAuthStrip ? (
        <AuthStrip
          token={token}
          user={user}
          profile={profile}
          apiError={apiError}
          isPinnedToPublish={activeSection === "Publish"}
          onAuthenticated={handleAuthenticated}
          onProfileSave={handleSaveProfile}
          onLogout={handleLogout}
          onClose={() => setAuthPanelOpen(false)}
          onToast={setToast}
        />
      ) : null}
      {activeSection === "Discover" ? (
        <DiscoverScreen
          filters={filters}
          listings={visibleListings}
          selectedListing={visibleSelectedListing}
          favoriteIds={favoriteIds}
          viewMode={viewMode}
          listingActionLabel={groupTourSelecting ? "选择用于 Group Tour" : "打开详情"}
          onFiltersChange={setFilters}
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
              setGroupTourSelecting(false);
              handleContactListing(listing, { tour: true });
            } else {
              openListingDetail(listing);
            }
          }}
          onFavorite={handleFavorite}
          onViewModeChange={setViewMode}
          onOpenRoommates={() => navigateToSection("Roommates")}
        />
      ) : null}
      {activeSection === "ListingDetail" ? (
        <ListingDetailScreen
          listing={selectedListing}
          filters={filters}
          favoriteIds={favoriteIds}
          contactedIds={contactedListingIds}
          tourRequestedIds={tourRequestedListingIds}
          appliedListingId={appliedListingId}
          dealStage={selectedDealStage}
          groupMembers={groupMembers}
          roommate={roommate}
          onBack={() => {
            setActiveSection("Discover");
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
          activeRoommate={roommate}
          groupMembers={groupMembers}
          likedRoommateIds={likedRoommateIds}
          likedMeRoommateIds={likedMeRoommateIds}
          introSentRoommateIds={introSentRoommateIds}
          skippedCount={skippedCount}
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
          likedRoommateIds={likedRoommateIds}
          likedMeRoommateIds={likedMeRoommateIds}
          introSentRoommateIds={introSentRoommateIds}
          tourRequested={tourRequested}
          onOpenRoommates={() => navigateToSection("Roommates")}
          onOpenMessages={() => navigateToSection("Messages")}
          onOpenDm={handleOpenRoommateDm}
          onDecideRoommate={handleDecideRoommate}
          onRequestTour={handleRequestGroupTour}
        />
      ) : null}
      {activeSection === "Messages" ? (
        <MessagesScreen
          contacts={inboxContacts}
          activeContact={activeInboxContact}
          selectedListing={activeMessageListing}
          selectedRoommate={activeRoommateDm}
          roommateThread={activeRoommateDmThread}
          dealStage={activeMessageStage}
          dealThread={activeMessageThread}
          latestViewingRequest={activeMessageViewingRequest}
          narrowPane={narrowMessagePane}
          viewingSlots={viewingSlots}
          onSendMessage={handleSendDealMessage}
          onSendRoommateMessage={handleSendRoommateDm}
          onRequestTour={handleRequestListingTour}
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
          listings={myListings}
          user={user}
          onCreate={handleCreateListing}
        />
      ) : null}
      {activeSection === "Trips" ? (
        <TripsScreen
          listing={selectedListing}
          trips={apiTrips}
          viewingRequests={viewingRequests}
          applications={applications}
          onAdvance={advanceEscrow}
          onOpenDealRoom={() => navigateToSection("Messages")}
        />
      ) : null}
      {activeSection === "Trust" ? (
        <TrustScreen queues={apiTrustQueues} onToast={setToast} />
      ) : null}
      <StatusToast message={toast} />
    </main>
  );
}

function AppHeader({
  favoriteCount,
  savedOnly,
  notifications,
  notificationsOpen,
  activeSection,
  onSectionChange,
  onSavedHomes,
  onNotifications,
  user,
  profile,
  onAuthOpen,
  onLogout
}: {
  favoriteCount: number;
  savedOnly: boolean;
  notifications: LocalNotification[];
  notificationsOpen: boolean;
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  onSavedHomes: () => void;
  onNotifications: () => void;
  user: SessionUser | null;
  profile: ApiProfile | null;
  onAuthOpen: () => void;
  onLogout: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const primaryItems = navItems.slice(0, 4);
  const secondaryItems = navItems.slice(4);
  const unreadCount = getUnreadNotificationCount(notifications);

  return (
    <header className="sticky top-0 z-30 border-b border-blue-100/80 bg-white/88 backdrop-blur-xl">
      <div className="app-shell grid h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-8 md:gap-5 xl:grid-cols-12 xl:gap-6">
        <div className="flex min-w-0 items-center gap-3 md:col-span-2 xl:col-span-3">
          <div className="flex size-11 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#006AFF,#0D4599)] text-white shadow-[0_16px_40px_rgba(0,106,255,0.28)]">
            <Home className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-lg font-black text-primary">Sublet Pipeline</div>
            <div className="hidden text-xs font-bold text-[#006AFF] xl:block">LA roommate-ready stays</div>
          </div>
        </div>

        <nav className="hidden min-w-0 items-center justify-center gap-1 md:col-span-5 md:flex xl:col-span-6 xl:gap-2">
          {primaryItems.map((item) => {
            const Icon = navIcons[item.section];

            return (
              <Button
                key={item.section}
                variant="ghost"
                size="default"
                className={cn(
                  "relative h-12 rounded-[18px] px-4 text-base font-extrabold text-muted-foreground hover:bg-blue-50 hover:text-primary",
                  (activeSection === item.section || (activeSection === "LikeQueue" && item.section === "Roommates")) &&
                    "bg-blue-50 text-[#006AFF] shadow-[inset_0_0_0_1px_rgba(0,106,255,0.10)] after:absolute after:-bottom-[15px] after:left-4 after:right-4 after:h-1 after:rounded-full after:bg-[#006AFF]"
                )}
                onClick={() => onSectionChange(item.section)}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Button>
            );
          })}
        </nav>

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 md:col-span-1 xl:col-span-3">
          <Button variant={savedOnly ? "secondary" : "ghost"} size="icon" className="hidden rounded-full sm:inline-flex" aria-label="Saved homes" onClick={onSavedHomes}>
            <Bookmark className={favoriteCount > 0 ? "fill-current text-primary" : undefined} />
          </Button>
          <Button variant={notificationsOpen ? "secondary" : "ghost"} size="icon" className="relative hidden rounded-full sm:inline-flex" aria-label="Notifications" onClick={onNotifications}>
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
              {user ? profile?.displayName ?? user.email : "Sign in"}
            </span>
          </button>
          {user ? (
            <Button variant="ghost" size="sm" className="hidden rounded-full font-bold lg:inline-flex" onClick={onLogout}>
              退出
            </Button>
          ) : null}
          <Button variant="outline" size="icon" className="rounded-full md:hidden" onClick={onAuthOpen} aria-label="Account">
            <ShieldCheck />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden rounded-full font-bold lg:inline-flex"
            onClick={() => onSectionChange("Publish")}
          >
            <DoorOpen data-icon="inline-start" />
            Host
          </Button>
          <Button variant="outline" size="icon" className="rounded-full md:hidden" aria-label="Open menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((current) => !current)}>
            <Menu />
          </Button>
        </div>
      </div>
      {notificationsOpen ? (
        <div className="absolute right-4 top-[68px] z-50 w-[min(360px,calc(100vw-2rem))] rounded-[24px] border border-blue-100 bg-white p-4 shadow-panel">
          <div className="text-base font-extrabold text-primary">Notifications</div>
          <div className="mt-3 grid gap-2">
            {notifications.length > 0 ? notifications.slice(0, 6).map((notification) => (
              <div key={notification.id} className="rounded-2xl bg-blue-50/70 p-3">
                <div className="text-sm font-extrabold text-primary">{notification.title}</div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">{notification.detail}</div>
              </div>
            )) : <div className="rounded-2xl border border-dashed p-4 text-sm font-semibold text-muted-foreground">暂无通知。完成 Like、DM、预约或申请后会显示在这里。</div>}
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
              </Button>
            );
          })}
          <Button variant={savedOnly ? "secondary" : "ghost"} size="sm" className="shrink-0" onClick={onSavedHomes}>
            <Bookmark className="size-3.5" aria-hidden="true" /> Saved
          </Button>
          <Button variant={notificationsOpen ? "secondary" : "ghost"} size="sm" className="shrink-0" onClick={onNotifications}>
            <Bell className="size-3.5" aria-hidden="true" /> Notifications
          </Button>
        </div>
      </div> : null}
    </header>
  );
}

function AuthStrip({
  token,
  user,
  profile,
  apiError,
  isPinnedToPublish,
  onAuthenticated,
  onProfileSave,
  onLogout,
  onClose,
  onToast
}: {
  token: string | null;
  user: SessionUser | null;
  profile: ApiProfile | null;
  apiError: string | null;
  isPinnedToPublish: boolean;
  onAuthenticated: (token: string, user: SessionUser) => void;
  onProfileSave: (profile: UpdateProfileInput) => Promise<void>;
  onLogout: () => void;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const apiPresentation = getApiPresentationState(apiError);
  const [email, setEmail] = useState("student@ucla.edu");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [profileDraft, setProfileDraft] = useState<UpdateProfileInput>({
    displayName: "",
    school: "UCLA",
    city: "LA",
    role: "renter",
    instagram: "",
    wechat: "",
    bio: ""
  });

  useEffect(() => {
    if (!profile) return;
    setProfileDraft({
      displayName: profile.displayName ?? "",
      school: profile.school ?? "UCLA",
      city: profile.city ?? "LA",
      role: profile.role,
      instagram: profile.instagram ?? "",
      wechat: profile.wechat ?? "",
      bio: profile.bio ?? ""
    });
  }, [profile]);

  async function requestCode() {
    setPending(true);
    try {
      const response = await requestEmailCode(email);
      if (response.devCode) setCode(response.devCode);
      onToast(response.devCode ? `开发验证码：${response.devCode}` : "验证码已发送");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode() {
    setPending(true);
    try {
      const response = await verifyEmailCode(email, code);
      onAuthenticated(response.accessToken, response.user);
      onToast(`已登录：${response.user.email}`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "登录失败");
    } finally {
      setPending(false);
    }
  }

  async function saveProfile() {
    setPending(true);
    try {
      await onProfileSave({
        displayName: profileDraft.displayName?.trim(),
        school: profileDraft.school?.trim(),
        city: profileDraft.city?.trim(),
        role: profileDraft.role,
        instagram: profileDraft.instagram?.trim(),
        wechat: profileDraft.wechat?.trim(),
        bio: profileDraft.bio?.trim()
      });
    } finally {
      setPending(false);
    }
  }

  const profileComplete = Boolean(profile?.displayName && profile.school && profile.city);

  return (
    <section className="border-b border-blue-100 bg-white">
      <div className="app-shell grid gap-4 py-4 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)] lg:items-start">
        <div className="min-w-0 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-black uppercase text-[#006AFF]">
                {user ? "Account ready" : "Email sign in"}
              </div>
              <div className="mt-1 text-lg font-black text-primary">
                {user ? profile?.displayName ?? user.email : "登录 / 注册"}
              </div>
            </div>
            {!isPinnedToPublish ? (
              <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose} aria-label="Close account panel">
                <X />
              </Button>
            ) : null}
          </div>
          <div className="mt-2 text-xs font-semibold text-muted-foreground">
            {token ? "已登录，资料与发布操作会同步 API" : `${apiPresentation.label}：${apiPresentation.detail}`}
          </div>
          {user ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={profileComplete ? "trust" : "warning"}>
                {profileComplete ? "Profile complete" : "Complete profile"}
              </Badge>
              <Badge variant="secondary">{profile?.role ?? user.role}</Badge>
            </div>
          ) : null}
        </div>
        {token && user ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ProfileInput
                label="Display name"
                value={profileDraft.displayName ?? ""}
                onChange={(value) => setProfileDraft((current) => ({ ...current, displayName: value }))}
                placeholder="Maya Chen"
              />
              <ProfileInput
                label="School"
                value={profileDraft.school ?? ""}
                onChange={(value) => setProfileDraft((current) => ({ ...current, school: value }))}
                placeholder="USC / UCLA"
              />
              <ProfileInput
                label="City"
                value={profileDraft.city ?? ""}
                onChange={(value) => setProfileDraft((current) => ({ ...current, city: value }))}
                placeholder="LA"
              />
              <label className="grid gap-1 text-xs font-black uppercase text-muted-foreground">
                Role
                <select
                  className="h-10 rounded-md border border-input bg-white px-3 text-sm font-bold normal-case text-primary shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={profileDraft.role ?? "renter"}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      role: event.target.value as UpdateProfileInput["role"]
                    }))
                  }
                >
                  <option value="renter">Renter</option>
                  <option value="lister">Lister</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <ProfileInput
                label="Instagram"
                value={profileDraft.instagram ?? ""}
                onChange={(value) => setProfileDraft((current) => ({ ...current, instagram: value }))}
                placeholder="optional"
              />
              <ProfileInput
                label="Wechat"
                value={profileDraft.wechat ?? ""}
                onChange={(value) => setProfileDraft((current) => ({ ...current, wechat: value }))}
                placeholder="private"
              />
              <label className="grid gap-1 text-xs font-black uppercase text-muted-foreground md:col-span-2">
                Bio
                <textarea
                  className="min-h-20 rounded-md border border-input bg-white px-3 py-2 text-sm font-semibold normal-case text-primary shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={profileDraft.bio ?? ""}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))}
                  placeholder="Brief roommate / housing intro"
                />
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <div className="rounded-md border bg-white p-3 text-xs font-semibold text-muted-foreground">
                <div className="font-black text-primary">{user.email}</div>
                <div className="mt-1">Wechat 只保存在你的私密资料里，不会公开展示。</div>
              </div>
              <Button variant="trust" size="sm" onClick={saveProfile} disabled={pending}>
                保存资料
              </Button>
              <Button variant="outline" size="sm" onClick={onLogout}>
                退出登录
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1fr)_120px_auto_auto]">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="student@ucla.edu"
            />
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="验证码"
            />
            <Button variant="outline" size="sm" onClick={requestCode} disabled={pending}>
              发送验证码
            </Button>
            <Button variant="trust" size="sm" onClick={verifyCode} disabled={pending || code.length !== 6}>
              登录
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase text-muted-foreground">
      {label}
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function RoommatesMarketplaceScreen({
  roommates,
  activeRoommate,
  groupMembers,
  likedRoommateIds,
  likedMeRoommateIds,
  introSentRoommateIds,
  skippedCount,
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
  activeRoommate: Roommate;
  groupMembers: Roommate[];
  likedRoommateIds: Set<string>;
  likedMeRoommateIds: Set<string>;
  introSentRoommateIds: Set<string>;
  skippedCount: number;
  onLike: (roommate: Roommate) => void;
  onLater: (roommate: Roommate) => void;
  onPass: (roommate: Roommate) => void;
  onSendIntro: (roommate: Roommate) => void;
  onOpenDm: (roommate: Roommate) => void;
  onDecideRoommate: (roommate: Roommate) => void;
  onOpenDiscover: () => void;
  onOpenLikeQueue: () => void;
}) {
  const [preference, setPreference] = useState<RoommatePreference>(defaultRoommatePreference);
  const [sortMode, setSortMode] = useState<"Preference" | "Budget">("Preference");
  const [deckIndex, setDeckIndex] = useState(0);
  const [searchApplied, setSearchApplied] = useState(false);
  const rankedRoommates = useMemo(() => rankRoommatesByPreference(roommates, preference), [preference, roommates]);
  const exactPreferenceMatches = useMemo(
    () => rankedRoommates.filter((candidate) => matchesRoommatePreference(candidate, preference)),
    [preference, rankedRoommates]
  );
  const displayRoommates = getRoommateDeckCandidates(rankedRoommates);
  const fallbackRoommate = useMemo(
    () => rankRoommatesByPreference([activeRoommate], preference)[0],
    [activeRoommate, preference]
  );
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
  const activeDeckRoommate = sortedRoommates[deckPosition] ?? fallbackRoommate;
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
  const activeRoommateKey = getRoommateKey(activeDeckRoommate);
  const activeConnectionStatus = getRoommateConnectionStatus(activeRoommateKey, connectionState);

  useEffect(() => {
    setDeckIndex(0);
  }, [preference, sortMode]);

  function updatePreference(nextPreference: RoommatePreference) {
    setPreference(nextPreference);
    setSearchApplied(false);
  }

  function goNextCard() {
    setDeckIndex((current) => current + 1);
  }

  function handleLike(roommate: Roommate) {
    onLike(roommate);
    goNextCard();
  }

  function handleLater(roommate: Roommate) {
    onLater(roommate);
    goNextCard();
  }

  function handlePass(roommate: Roommate) {
    onPass(roommate);
    goNextCard();
  }

  function cycleGenderFilter() {
    const currentIndex = roommateGenderOptions.indexOf(preference.gender);
    const nextGender = roommateGenderOptions[(currentIndex + 1) % roommateGenderOptions.length];
    updatePreference({ ...preference, gender: nextGender });
  }

  function cycleBudgetFilter() {
    const presets = [
      { budgetMin: 1200, budgetMax: 1800 },
      { budgetMin: 1500, budgetMax: 2200 },
      { budgetMin: 900, budgetMax: 1500 },
      { budgetMin: 0, budgetMax: 3000 }
    ];
    const currentIndex = presets.findIndex(
      (preset) => preset.budgetMin === preference.budgetMin && preset.budgetMax === preference.budgetMax
    );
    const nextPreset = presets[(currentIndex + 1) % presets.length];
    updatePreference({ ...preference, ...nextPreset });
  }

  function cycleSchoolFilter() {
    const presets = [["UCLA"], ["USC"], ["Caltech"], ["LMU"], []] as const;
    const currentKey = preference.schools.join(",");
    const currentIndex = presets.findIndex((preset) => preset.join(",") === currentKey);
    const nextSchools = presets[(currentIndex + 1) % presets.length];
    updatePreference({ ...preference, schools: [...nextSchools] });
  }

  function cycleHobbyFilter() {
    const presets = [
      ["早睡", "健身", "安静"],
      ["会做饭", "爱干净"],
      ["轻社交", "宠物友好"],
      []
    ] as const;
    const currentKey = preference.hobbies.join(",");
    const currentIndex = presets.findIndex((preset) => preset.join(",") === currentKey);
    const nextHobbies = presets[(currentIndex + 1) % presets.length];
    updatePreference({ ...preference, hobbies: [...nextHobbies] });
  }

  return (
    <section className="relative mx-auto flex w-full max-w-[1560px] flex-col gap-6 overflow-hidden px-4 py-5 xl:px-6">
      <RoommatePathGraphic className="left-0 top-28 hidden xl:block" />
      <RoommatePathGraphic className="bottom-8 right-28 hidden rotate-180 xl:block" />

      <Card className="glass-panel overflow-hidden rounded-[36px] border-blue-100 bg-white shadow-[0_22px_80px_rgba(0,106,255,0.10)]">
        <CardContent className="p-4 md:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <h1 className="text-display text-4xl font-black leading-tight text-primary md:text-6xl">
                Roommate Match
              </h1>
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                {exactPreferenceMatches.length} filtered / {roommates.length} verified · {reviewedCount} reviewed · {likedRoommateIds.size} liked
                {searchApplied ? " · Preference refreshed" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="secondary" className="rounded-full font-bold" onClick={onOpenLikeQueue}>
                <Heart data-icon="inline-start" />
                Like Queue · {likedRoommateIds.size}
              </Button>
              <Button variant="outline" className="rounded-full font-bold" onClick={onOpenDiscover}>
                <Home data-icon="inline-start" />
                Browse stays
              </Button>
              <Button
                className="rounded-full bg-[#006AFF] font-bold text-white hover:bg-[#0D4599]"
                onClick={() => setSearchApplied(true)}
              >
                <SlidersHorizontal data-icon="inline-start" />
                Apply preference
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)] md:grid-cols-2 xl:grid-cols-4">
            <PreferenceSummaryField
              icon={Users}
              label="Shared living"
              value={roommateGenderLabels[preference.gender]}
              onClick={cycleGenderFilter}
            />
            <PreferenceSummaryField
              icon={DollarSign}
              label="Budget"
              value={`$${preference.budgetMin.toLocaleString()} - $${preference.budgetMax.toLocaleString()}`}
              onClick={cycleBudgetFilter}
            />
            <PreferenceSummaryField
              icon={GraduationCap}
              label="School"
              value={preference.schools.join(", ") || "不限"}
              onClick={cycleSchoolFilter}
            />
            <PreferenceSummaryField
              icon={Sparkles}
              label="Hobbies"
              value={preference.hobbies.slice(0, 3).join(", ") || "不限"}
              onClick={cycleHobbyFilter}
            />
          </div>
        </CardContent>
      </Card>

      <div className="relative z-10 grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <RoommatePreferencePanel
          preference={preference}
          fitScore={activeDeckRoommate.preferenceFit.score}
          onPreferenceChange={updatePreference}
        />

        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-extrabold text-primary">
                {activeDeckRoommate.preferenceFit.score}% preference fit
              </div>
              <div className="text-sm font-semibold text-muted-foreground">
                Card {deckPosition + 1} of {Math.max(1, sortedRoommates.length)}
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
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <SwipeRoommateDeck
            roommate={activeDeckRoommate}
            nextRoommate={nextDeckRoommate}
            liked={likedRoommateIds.has(getRoommateKey(activeDeckRoommate))}
            connectionStatus={activeConnectionStatus}
            onLike={() => handleLike(activeDeckRoommate)}
            onLater={() => handleLater(activeDeckRoommate)}
            onPass={() => handlePass(activeDeckRoommate)}
            onSendIntro={() => onSendIntro(activeDeckRoommate)}
            onOpenDm={() => onOpenDm(activeDeckRoommate)}
            onDecideRoommate={() => onDecideRoommate(activeDeckRoommate)}
          />

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
  onClick
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-16 min-w-0 items-center gap-3 border-b border-blue-100 bg-white px-4 py-3 text-left transition-colors hover:bg-blue-50 last:border-b-0 md:border-r md:last:border-r-0 xl:border-b-0"
      type="button"
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
  onPreferenceChange
}: {
  preference: RoommatePreference;
  fitScore: number;
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
    <Card className="glass-panel h-fit overflow-hidden rounded-[32px] border-blue-100 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-display text-2xl font-black">My Preference</CardTitle>
            <CardDescription className="font-semibold">Shared-living match settings</CardDescription>
          </div>
          <div className="flex size-11 items-center justify-center rounded-full bg-blue-50 text-[#006AFF]">
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 rounded-[26px] border border-blue-100 bg-white p-4 shadow-[0_16px_50px_rgba(0,106,255,0.08)]">
          <MatchScoreRing score={fitScore} label="Match Fit" size="lg" />
          <div className="min-w-0">
            <div className="text-base font-black text-primary">
              {fitScore >= 90 ? "Great start!" : fitScore >= 78 ? "Strong lane" : "Needs tuning"}
            </div>
            <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
              Preference updates reorder the swipe deck without hiding candidates.
            </p>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">性别</div>
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
              aria-label="Minimum roommate budget"
              className="h-11 rounded-2xl border-blue-100 text-sm font-bold"
              min={600}
              max={preference.budgetMax}
              onChange={(event) => setBudget("budgetMin", event.target.value)}
              type="number"
              value={preference.budgetMin}
            />
            <Input
              aria-label="Maximum roommate budget"
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
                {school}
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
  onClick
}: {
  icon: LucideIcon;
  label: string;
  tone: "pass" | "later" | "like";
  onClick: () => void;
}) {
  const toneClass = {
    pass: "border-red-100 bg-white text-trust-red hover:bg-red-50",
    later: "border-blue-100 bg-white text-[#006AFF] hover:bg-blue-50",
    like: "border-[#006AFF] bg-[#006AFF] text-white shadow-[0_18px_34px_rgba(0,106,255,0.28)] hover:bg-[#0D4599]"
  }[tone];

  return (
    <button className="group flex min-w-0 flex-col items-center gap-2 text-sm font-black" type="button" onClick={onClick}>
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
  onLike: () => void;
  onLater: () => void;
  onPass: () => void;
  onSendIntro: () => void;
  onOpenDm: () => void;
  onDecideRoommate: () => void;
}) {
  const reasons = roommate.preferenceFit.reasons.slice(0, 4);
  const gaps = roommate.preferenceFit.gaps.slice(0, 2);
  const canSendIntro = connectionStatus === "new" || connectionStatus === "liked-by-me" || connectionStatus === "liked-you";
  const canOpenDm = connectionStatus === "mutual" || connectionStatus === "roommate";
  const canDecideRoommate = connectionStatus === "mutual";

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
            {roommate.preferenceFit.score}% fit
            </Badge>
            <Badge className="border-white/20 bg-[#006AFF] text-white shadow-sm">
              Verified
            </Badge>
          </div>
          <Badge className="absolute right-4 top-4 border-white/25 bg-slate-950/45 text-white shadow-sm">
            {getRoommateStatusLabel(connectionStatus)}
          </Badge>
          <div className="absolute bottom-8 right-6 hidden sm:block">
            <MatchScoreRing score={roommate.preferenceFit.score} label="Match" size="lg" inverted />
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
                <div className="text-xs font-bold uppercase text-white/70">Budget</div>
                <div className="text-lg font-extrabold">{roommate.budget.replace("/月", "/mo")}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ProfileMiniStat icon={Users} label="Gender" value={roommate.gender ?? "Open"} />
            <ProfileMiniStat icon={GraduationCap} label="School" value={roommate.school ?? "Other"} />
            <ProfileMiniStat icon={MapPin} label="Area" value={roommate.commute} />
          </div>

          <div>
            <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Match reasons</div>
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
            <SwipeActionButton icon={X} label="Pass" tone="pass" onClick={onPass} />
            <SwipeActionButton icon={Star} label="Later" tone="later" onClick={onLater} />
            <SwipeActionButton icon={Heart} label={liked ? "Liked" : "Like"} tone="like" onClick={onLike} />
          </div>

          <div className="grid gap-2 rounded-[24px] border border-blue-100 bg-blue-50/70 p-3 sm:grid-cols-2">
            {canOpenDm ? (
              <Button className="rounded-full bg-[#006AFF] font-extrabold text-white hover:bg-[#0D4599]" onClick={onOpenDm}>
                <MessageCircle data-icon="inline-start" />
                Open DM
              </Button>
            ) : (
              <Button
                variant={canSendIntro ? "outline" : "secondary"}
                className="rounded-full font-extrabold"
                disabled={!canSendIntro}
                onClick={onSendIntro}
              >
                <Send data-icon="inline-start" />
                {connectionStatus === "intro-sent" ? "Intro sent" : "Send intro"}
              </Button>
            )}
            <Button
              variant={canDecideRoommate || connectionStatus === "roommate" ? "trust" : "secondary"}
              className="rounded-full font-extrabold"
              disabled={!canDecideRoommate && connectionStatus !== "roommate"}
              onClick={onDecideRoommate}
            >
              <UserCheck data-icon="inline-start" />
              {connectionStatus === "roommate" ? "Roommate" : "Decide roommate"}
            </Button>
            <p className="text-xs font-semibold leading-5 text-muted-foreground sm:col-span-2">
              {getRoommateStatusDescription(connectionStatus)}
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}

function getRoommateStatusLabel(status: RoommateConnectionStatus) {
  if (status === "roommate") return "Roommate";
  if (status === "mutual") return "Mutual match";
  if (status === "intro-sent") return "Intro sent";
  if (status === "liked-you") return "Liked you";
  if (status === "liked-by-me") return "Waiting";
  return "New";
}

function getRoommateStatusDescription(status: RoommateConnectionStatus) {
  if (status === "roommate") return "You both decided to room together. Group tour is now unlocked.";
  if (status === "mutual") return "Mutual like unlocked private DM. Decide as roommates before group tour.";
  if (status === "intro-sent") return "Opening message sent. More private messages unlock after a mutual like.";
  if (status === "liked-you") return "They liked you. Like back to unlock private DM.";
  if (status === "liked-by-me") return "Saved to Liked by me. Private DM unlocks when they like you back.";
  return "Before mutual like, you can send exactly one opening message.";
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
          <div className="text-lg font-extrabold text-primary">Next matches</div>
          <div className="text-xs font-bold text-muted-foreground">Preference-ranked queue</div>
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
                <div className="text-xs font-bold text-[#006AFF]">{roommate.preferenceFit.score}% fit</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-bold text-muted-foreground">{roommate.school ?? "Other"}</span>
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
  likedRoommateIds,
  likedMeRoommateIds,
  introSentRoommateIds,
  tourRequested,
  onOpenRoommates,
  onOpenMessages,
  onOpenDm,
  onDecideRoommate,
  onRequestTour
}: {
  roommates: Roommate[];
  members: Roommate[];
  likedRoommateIds: Set<string>;
  likedMeRoommateIds: Set<string>;
  introSentRoommateIds: Set<string>;
  tourRequested: boolean;
  onOpenRoommates: () => void;
  onOpenMessages: () => void;
  onOpenDm: (roommate: Roommate) => void;
  onDecideRoommate: (roommate: Roommate) => void;
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
      <Card className="overflow-hidden rounded-[32px] border-blue-100 shadow-panel">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Heart className="size-6 fill-[#006AFF] text-[#006AFF]" aria-hidden="true" />
              <h1 className="text-display text-3xl font-black text-primary">Like Queue</h1>
            </div>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {waitingMembers.length} waiting · {mutualMembers.length} mutual · {members.length} roommates
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full font-bold" onClick={onOpenRoommates}>
              <Users data-icon="inline-start" />
              Back to matching
            </Button>
            <Button className="rounded-full bg-[#006AFF] font-bold text-white hover:bg-[#0D4599]" onClick={onOpenMessages}>
              <MessageCircle data-icon="inline-start" />
              Messages
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <QueueColumn title="Waiting for a like back" description="Liked by you" count={waitingMembers.length}>
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
            <QueueEmptyState>Like someone to save them here.</QueueEmptyState>
          )}
        </QueueColumn>

        <QueueColumn title="Mutual matches" description="Private DM is unlocked" count={mutualMembers.length}>
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
            <QueueEmptyState>Mutual likes will appear here.</QueueEmptyState>
          )}
        </QueueColumn>

        <QueueColumn title="Roommate group" description={ready ? `$${averageBudget.toLocaleString()} per person` : "Decide as roommates first"} count={members.length}>
          <div className="text-3xl font-extrabold text-primary">{ready ? `$${totalBudget.toLocaleString()} / mo` : "Locked"}</div>
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
            <QueueEmptyState>No roommate group yet.</QueueEmptyState>
          )}
          <Button className="mt-auto h-11 rounded-full bg-[#006AFF] font-extrabold text-white hover:bg-[#0D4599]" disabled={!ready} onClick={onRequestTour}>
            <CalendarDays data-icon="inline-start" />
            {tourRequested && ready ? "Group tour requested" : "Request group tour"}
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
    <Card className="min-h-[520px] rounded-[30px] border-blue-100 shadow-panel">
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

function RoommateDmPanel({
  roommate,
  thread,
  onSendMessage
}: {
  roommate: Roommate;
  thread: RoommateDmThread;
  onSendMessage: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const visibleMessages = thread.messages.slice(-5);
  const quickReplies = [
    "你理想入住时间是什么时候？",
    "预算和区域我这边也合适。",
    "我们可以先聊一下作息和做饭频率。"
  ];

  function submitMessage(body = draft) {
    if (!body.trim()) return;
    onSendMessage(body);
    setDraft("");
  }

  return (
    <Card className="shadow-panel" data-testid="roommate-dm-panel">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>DM & Roommate fit</CardTitle>
            <CardDescription>{roommate.name} · {roommate.role}</CardDescription>
          </div>
          <Badge variant="trust">Mutual</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto rounded-[24px] border border-blue-100 bg-blue-50/50 p-3 app-scrollbar">
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
          placeholder={`给 ${roommate.name} 发私信`}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitMessage();
            }
          }}
          />
          <Button className="h-20 rounded-[22px] bg-[#006AFF] px-4 text-white hover:bg-[#0D4599]" onClick={() => submitMessage()}>
            <Send aria-hidden="true" />
            <span className="sr-only">发送 roommate DM</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
  const canDm = canOpenRoommateDm(key, state);
  const canDecide = status === "mutual";

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
        <Button size="icon" variant={canDm ? "outline" : "secondary"} className="size-9 rounded-full" disabled={!canDm} onClick={() => onOpenDm(roommate)}>
          <MessageCircle className="size-4" aria-hidden="true" />
          <span className="sr-only">Open DM</span>
        </Button>
        <Button size="icon" variant={canDecide || status === "roommate" ? "trust" : "secondary"} className="size-9 rounded-full" disabled={!canDecide && status !== "roommate"} onClick={() => onDecideRoommate(roommate)}>
          <UserCheck className="size-4" aria-hidden="true" />
          <span className="sr-only">Decide roommate</span>
        </Button>
      </div>
    </div>
  );
}

function DiscoverScreen({
  filters,
  listings,
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
  onOpenRoommates
}: {
  filters: SearchFilters;
  listings: Listing[];
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
        resultCount={listings.length}
        onFiltersChange={onFiltersChange}
        onAmenityChange={onAmenityChange}
        onClear={onClear}
      />

      <div className="app-grid items-start">
        <div className={cn("col-span-full flex min-w-0 flex-col gap-4", viewMode === "map" && "lg:col-span-4 xl:col-span-7")}>
          <MarketToolbar
            listingCount={listings.length}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            favoriteCount={favoriteIds.size}
            dateRangeLabel={formatDateRangeLabel(filters)}
            onOpenRoommates={onOpenRoommates}
          />
          {listings.length === 0 ? (
            <EmptyResults filters={filters} onClear={onClear} />
          ) : (
            <ListingGrid
              listings={listings.slice(0, 100)}
              selectedId={selectedListing.id}
              favoriteIds={favoriteIds}
              onPreview={onPreview}
              onOpenListing={onOpenListing}
              onFavorite={onFavorite}
              actionLabel={listingActionLabel}
            />
          )}
        </div>

        {viewMode === "map" ? (
          <aside className="col-span-full hidden min-w-0 lg:col-span-4 lg:block xl:col-span-5">
            <MapCanvas
              className="sticky top-24"
              listings={listings}
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
  onFiltersChange,
  onAmenityChange,
  onClear
}: {
  filters: SearchFilters;
  resultCount: number;
  onFiltersChange: (filters: SearchFilters) => void;
  onAmenityChange: (value: string) => void;
  onClear: () => void;
}) {
  const insight = buildSearchInsight(filters, resultCount);
  const normalizedPrice = normalizePriceRange(filters);

  function updatePrice(nextPrice: Partial<Pick<SearchFilters, "priceMin" | "priceMax">>) {
    onFiltersChange({
      ...filters,
      ...normalizePriceRange({
        priceMin: nextPrice.priceMin ?? filters.priceMin,
        priceMax: nextPrice.priceMax ?? filters.priceMax
      })
    });
  }

  return (
    <Card className="glass-panel overflow-hidden rounded-[34px] border-blue-100 bg-white shadow-[0_22px_80px_rgba(0,106,255,0.10)]">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-4 gap-4 md:grid-cols-8 md:gap-5 xl:grid-cols-12 xl:items-end xl:gap-6">
          <label className="col-span-4 flex flex-col gap-2 text-sm font-semibold xl:col-span-4">
            目的地
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-12 rounded-full border-blue-100 bg-white pl-10 text-base font-bold shadow-sm"
                value={filters.query}
                onChange={(event) =>
                  onFiltersChange({ ...filters, query: event.target.value })
                }
                placeholder="学校、公司、街区"
              />
            </div>
          </label>
          <div className="col-span-4 xl:col-span-4">
            <DateRangePicker
              range={filters}
              onChange={(range) => onFiltersChange({ ...filters, ...range })}
            />
          </div>
          <div className="col-span-4 flex flex-col gap-2 text-sm font-semibold xl:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <span>价格区间</span>
              <span className="text-xs font-black text-[#006AFF]">{formatPriceRangeLabel(filters)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="最低价格"
                className="h-10 rounded-full border-blue-100 bg-white text-sm font-bold shadow-sm"
                min={priceFilterBounds.min}
                max={normalizedPrice.priceMax}
                step={50}
                type="number"
                value={normalizedPrice.priceMin}
                onChange={(event) => updatePrice({ priceMin: Number(event.target.value) })}
              />
              <Input
                aria-label="最高价格"
                className="h-10 rounded-full border-blue-100 bg-white text-sm font-bold shadow-sm"
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
          <Button variant="trust" className="col-span-4 h-12 px-5 font-black xl:col-span-1" onClick={onClear}>
            重置
          </Button>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
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
                  onClick={() => onAmenityChange(amenity.label)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {amenity.label}
                </button>
              );
            })}
          </div>
          <div className="text-sm font-semibold text-muted-foreground">
            当前命中 <span className="text-primary">{resultCount}</span> 套房源
          </div>
        </div>

        <div
          className={cn(
            "grid grid-cols-1 gap-3 rounded-[24px] border p-4 lg:grid-cols-[190px_minmax(0,1fr)_minmax(240px,0.8fr)] lg:items-center",
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
      </CardContent>
    </Card>
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
  const [activeField, setActiveField] = useState<"checkIn" | "checkOut">("checkIn");
  const months = useMemo(() => buildCalendarMonths(range.checkIn || defaultSearchFilters.checkIn, 4), [range.checkIn]);
  const nights = countNights(range);
  const flexibleStays = [
    { label: "周末", nights: 2 },
    { label: "一周", nights: 7 },
    { label: "一个月", nights: 30 }
  ];

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
          onClick={() => {
            setActiveField("checkIn");
            setOpen((current) => !current || activeField !== "checkIn");
          }}
        >
          <CalendarDays data-icon="inline-start" />
          {range.checkIn ? formatShortDate(range.checkIn) : "入住"}
        </Button>
        <Button
          variant={activeField === "checkOut" && open ? "secondary" : "outline"}
          className="h-11 justify-start"
          onClick={() => {
            setActiveField("checkOut");
            setOpen((current) => !current || activeField !== "checkOut");
          }}
        >
          <CalendarDays data-icon="inline-start" />
          {range.checkOut ? formatShortDate(range.checkOut) : "搬出"}
        </Button>
      </div>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 rounded-lg border bg-white p-4 shadow-panel lg:right-auto lg:w-[720px]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-base font-extrabold text-primary">{formatDateRangeLabel(range)}</div>
              <div className="text-xs font-semibold text-muted-foreground">
                {nights > 0 ? "先选入住，再选搬出；结果会自动更新。" : "请选择入住和搬出日期。"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {flexibleStays.map((stay) => (
                <Button
                  key={stay.label}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onChange(applyFlexibleStay(range, stay.nights));
                    setActiveField("checkIn");
                  }}
                >
                  {stay.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid max-h-[420px] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
            {months.map((month) => (
              <div key={month.key} className="min-w-0">
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
                        aria-label={`${day.iso}${isStart ? " 入住" : isEnd ? " 搬出" : ""}`}
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
            <Button variant="trust" size="sm" onClick={() => setOpen(false)}>
              完成
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessagesScreen({
  contacts,
  activeContact,
  selectedListing,
  selectedRoommate,
  roommateThread,
  dealStage,
  dealThread,
  latestViewingRequest,
  narrowPane,
  viewingSlots,
  onSendMessage,
  onSendRoommateMessage,
  onRequestTour,
  onSelectContact,
  onBackToContacts,
  onOpenListing
}: {
  contacts: InboxContact[];
  activeContact: InboxContact | null;
  selectedListing: Listing | null;
  selectedRoommate: Roommate | null;
  roommateThread: RoommateDmThread | null;
  dealStage: string;
  dealThread: DealThread | null;
  latestViewingRequest: ViewingRequest | null;
  narrowPane: "contacts" | "conversation";
  viewingSlots: ViewingSlot[];
  onSendMessage: (listing: Listing, body: string) => void;
  onSendRoommateMessage: (roommate: Roommate, body: string) => void;
  onRequestTour: (listing: Listing, slot?: ViewingSlot) => void;
  onSelectContact: (contact: InboxContact) => void;
  onBackToContacts: () => void;
  onOpenListing: (listing: Listing) => void;
}) {
  return (
    <section className="app-shell grid min-h-[calc(100vh-76px)] w-full grid-cols-1 gap-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className={cn("min-w-0", narrowPane === "conversation" && "hidden lg:block")}>
        <Card className="h-full min-h-[640px] overflow-hidden shadow-panel">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Messages</CardTitle>
                <CardDescription>房东和室友联系人按最近消息排列</CardDescription>
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
                        <span className="shrink-0 text-[10px] font-black text-muted-foreground">{contact.time}</span>
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
                还没有联系人。联系房东或与室友互相 Like 后，会话会出现在这里。
              </div>
            )}
          </CardContent>
        </Card>
      </aside>

      <div className={cn("min-w-0 flex-col gap-4", narrowPane === "conversation" ? "flex" : "hidden lg:flex")}>
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
                    <span>{selectedListing.beds} Bed · {selectedListing.baths} Bath</span>
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
              onSendMessage={onSendMessage}
              onRequestTour={onRequestTour}
            />
          </>
        ) : activeContact?.kind === "roommate" && selectedRoommate && roommateThread ? (
          <>
            <Card className="overflow-hidden shadow-panel">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar className="size-16 ring-2 ring-blue-100">
                    <AvatarImage src={selectedRoommate.image} alt="" />
                    <AvatarFallback>{selectedRoommate.name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="trust">室友</Badge>
                      <Badge variant="secondary">Mutual match</Badge>
                    </div>
                    <div className="mt-2 truncate text-xl font-extrabold text-primary">{selectedRoommate.name}</div>
                    <div className="truncate text-sm font-semibold text-muted-foreground">{selectedRoommate.role}</div>
                  </div>
                </div>
                <div className="text-sm font-bold text-muted-foreground">{selectedRoommate.budget} · {selectedRoommate.commute}</div>
              </CardContent>
            </Card>
            <RoommateDmPanel
              key={roommateThread.id}
              roommate={selectedRoommate}
              thread={roommateThread}
              onSendMessage={(body) => onSendRoommateMessage(selectedRoommate, body)}
            />
          </>
        ) : (
          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle>选择联系人</CardTitle>
              <CardDescription>从左侧选择房东或室友，右侧会打开对应的 DM。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-[24px] border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center text-sm font-semibold text-muted-foreground">
                联系房东，或先与室友互相 Like 解锁私信。
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function PublishScreen({
  isPublishing,
  listings,
  user,
  onCreate
}: {
  isPublishing: boolean;
  listings: ApiListing[];
  user: SessionUser | null;
  onCreate: (draft: PublishDraft) => void;
}) {
  return (
    <section className="app-shell w-full py-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <PublishingFlow isPublishing={isPublishing} onCreate={onCreate} />
        <LandlordListingsPanel listings={listings} user={user} />
      </div>
    </section>
  );
}

function LandlordListingsPanel({
  listings,
  user
}: {
  listings: ApiListing[];
  user: SessionUser | null;
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
          <Badge variant={user ? "trust" : "secondary"}>{user ? "Owner" : "Guest"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!user ? (
          <div className="rounded-md border bg-secondary p-4 text-sm font-semibold text-primary">
            先用邮箱验证码登录，再创建房源并查看审核状态。
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-md border bg-white p-4 text-sm font-semibold text-muted-foreground">
            还没有发布记录。创建后会先进入审核中，审核通过才会出现在租客 Discover。
          </div>
        ) : (
          listings.map((listing) => {
            const status = normalizeListingStatus(listing.status);
            const meta = getListingStatusMeta(status);

            return (
              <div key={listing.id} className="rounded-md border bg-white p-3">
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
                  <span>{listing.media?.length ?? 0} media</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">{meta.description}</p>
                {status === "REJECTED" && listing.rejectionReason ? (
                  <p className="mt-2 rounded-md bg-secondary p-2 text-xs font-semibold text-primary">
                    {listing.rejectionReason}
                  </p>
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
  listing,
  trips,
  viewingRequests,
  applications,
  onAdvance,
  onOpenDealRoom
}: {
  listing: Listing;
  trips: ApiTrip[];
  viewingRequests: ViewingRequest[];
  applications: LocalApplication[];
  onAdvance: (applicationId: string) => void;
  onOpenDealRoom: () => void;
}) {
  const listingViewingRequests = viewingRequests.filter((request) => request.listingId === listing.id);
  const application = applications.find((item) => item.listingId === listing.id) ?? applications[0] ?? null;
  const currentStep = application ? applicationStatuses.indexOf(application.status) : -1;

  return (
    <section className="app-shell grid w-full grid-cols-1 gap-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      {application ? (
        <EscrowPanel listing={listing} currentStep={currentStep} onAdvance={() => onAdvance(application.id)} />
      ) : (
        <Card className="shadow-panel">
          <CardHeader><CardTitle>还没有申请</CardTitle><CardDescription>预约看房后，可从房源详情明确开始申请。</CardDescription></CardHeader>
          <CardContent><Badge variant="secondary">No application</Badge></CardContent>
        </Card>
      )}
      <Card className="shadow-panel">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>订单、看房与入住</CardTitle>
              <CardDescription>后端返回 {trips.length} 个订单/入住记录 · 本地 {listingViewingRequests.length} 个看房记录</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onOpenDealRoom}>
              <MessageCircle data-icon="inline-start" />
              Messages
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              ["定金", `$${listing.price.toLocaleString()}`, "Stripe Connect 托管"],
              ["入住", "8/20", "首日缺陷可介入"],
              ["评价", "待完成", "入住后开放"]
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-md border bg-white p-4">
                <div className="text-xs font-bold text-muted-foreground">{label}</div>
                <div className="mt-2 text-xl font-extrabold text-primary">{value}</div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">{detail}</div>
              </div>
            ))}
          </div>
          <div className="rounded-[24px] border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-extrabold text-primary">看房安排</div>
                <div className="text-sm font-semibold text-muted-foreground">{listing.title}</div>
              </div>
              <CalendarDays className="size-5 text-[#006AFF]" aria-hidden="true" />
            </div>
            <div className="mt-4 grid gap-3">
              {listingViewingRequests.length > 0 ? (
                listingViewingRequests.map((request) => (
                  <div key={request.id} className="grid gap-3 rounded-[22px] border border-blue-100 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="font-extrabold text-primary">{request.timeLabel}</div>
                      <div className="mt-1 text-sm font-semibold text-muted-foreground">
                        {getViewingModeLabel(request.mode)} · {request.participantNames.join(", ")}
                      </div>
                    </div>
                    <Badge variant={request.status === "CONFIRMED" ? "success" : "trust"}>
                      {getViewingStatusLabel(request.status)}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-blue-200 bg-white p-4 text-sm font-semibold text-muted-foreground">
                  还没有看房安排。回到房源详情或 Messages 选择时间。
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ListingDetailScreen({
  listing,
  filters,
  favoriteIds,
  contactedIds,
  tourRequestedIds,
  appliedListingId,
  dealStage,
  groupMembers,
  roommate,
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
  appliedListingId: string | null;
  dealStage: string;
  groupMembers: Roommate[];
  roommate: Roommate;
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
    tourRequestedIds,
    appliedListingId
  });
  const roommateCount = Math.max(1, groupMembers.length || 1);
  const perPersonPrice = Math.round(listing.price / roommateCount);

  return (
    <section className="app-shell app-grid w-full items-start py-5 md:py-6">
      <div className="app-section flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" className="w-fit" onClick={onBack}>
          <ArrowRight className="rotate-180" data-icon="inline-start" />
          返回房源
        </Button>
        <div className="flex flex-wrap gap-2">
          {flow.isContacted ? <Badge variant="success">已联系</Badge> : null}
          {flow.isTourRequested ? <Badge variant="trust">已预约看房</Badge> : null}
          {flow.isApplied ? <Badge variant="warning">申请中</Badge> : null}
        </div>
      </div>

      <div className="col-span-full flex min-w-0 flex-col gap-4 xl:col-span-8">
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
                <Metric icon={BedDouble} label="卧室" value={`${listing.beds} Bed`} />
                <Metric icon={Bath} label="卫浴" value={`${listing.baths} Bath`} />
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
                <div className="text-xs font-bold text-muted-foreground">当前室友</div>
                <div className="mt-2 text-lg font-extrabold text-primary">{roommate.name}</div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">{roommate.match}% Match</div>
              </div>
              <div className="rounded-md border bg-white p-4">
                <div className="text-xs font-bold text-muted-foreground">Group 人均</div>
                <div className="mt-2 text-lg font-extrabold text-primary">${perPersonPrice.toLocaleString()}/月</div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">{roommateCount} 人预算估算</div>
              </div>
              <div className="rounded-md border bg-white p-4">
                <div className="text-xs font-bold text-muted-foreground">流程状态</div>
                <div className="mt-2 text-lg font-extrabold text-primary">
                  {flow.isApplied ? "申请中" : dealStage}
                </div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">操作会即时同步到本页</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="col-span-full flex min-w-0 flex-col gap-4 xl:col-span-4">
          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle>申请流程</CardTitle>
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
                {flow.isTourRequested ? "看房已预约" : "预约看房"}
                <CalendarDays data-icon="inline-end" />
              </Button>
              <Button
                variant="trust"
                className="w-full justify-between"
                onClick={() => onApply(listing)}
              >
                {flow.primaryCta}
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
                  <span>预计押金</span>
                  <span>${Math.round(listing.price * 0.5).toLocaleString()}</span>
                </div>
                <div className="mt-2 flex justify-between text-muted-foreground">
                  <span>服务费</span>
                  <span>${Math.round(listing.price * 0.035).toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle>消息中心</CardTitle>
              <CardDescription>联系后会跳到独立 Messages 页面，保留房源上下文和看房进度。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full justify-between" variant="secondary" onClick={() => onContact(listing)}>
                打开 Messages
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
  onSendMessage,
  onRequestTour
}: {
  listing: Listing;
  thread: DealThread;
  stage: string;
  viewingSlots: ViewingSlot[];
  latestViewingRequest: ViewingRequest | null;
  onSendMessage: (listing: Listing, body: string) => void;
  onRequestTour: (listing: Listing, slot?: ViewingSlot) => void;
}) {
  const [draft, setDraft] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState(viewingSlots[0]?.id ?? "");
  const selectedSlot = viewingSlots.find((slot) => slot.id === selectedSlotId) ?? viewingSlots[0];
  const visibleMessages = thread.messages.slice(-5);
  const quickReplies = [
    "这套现在还可以约看吗？",
    "可以先发一段视频 walkthrough 吗？",
    "我想和室友一起看房。"
  ];

  useEffect(() => {
    if (viewingSlots.length > 0 && !viewingSlots.some((slot) => slot.id === selectedSlotId)) {
      setSelectedSlotId(viewingSlots[0].id);
    }
  }, [selectedSlotId, viewingSlots]);

  function submitMessage(body = draft) {
    if (!body.trim()) return;
    onSendMessage(listing, body);
    setDraft("");
  }

  return (
    <Card className="shadow-panel" data-testid="deal-dm-panel">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>DM & 看房</CardTitle>
            <CardDescription>{thread.subject}</CardDescription>
          </div>
          <Badge variant={latestViewingRequest ? "trust" : "secondary"}>{stage}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {thread.participants.map((participant) => (
            <Badge key={participant} variant={participant === "You" ? "trust" : "secondary"}>
              {participant}
            </Badge>
          ))}
        </div>

        <div className="flex max-h-[320px] flex-col gap-3 overflow-y-auto rounded-[24px] border bg-blue-50/50 p-3 app-scrollbar">
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
            placeholder="输入 DM 给房东 / 室友"
          />
          <Button className="h-20 rounded-[22px] bg-[#006AFF] px-4 text-white hover:bg-[#0D4599]" onClick={() => submitMessage()}>
            <Send aria-hidden="true" />
            <span className="sr-only">发送 DM</span>
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
                  : "选择时间后会同步到 Trips 和 Messages"}
              </div>
            </div>
            {latestViewingRequest ? (
              <Badge variant={latestViewingRequest.status === "CONFIRMED" ? "success" : "trust"}>
                {getViewingStatusLabel(latestViewingRequest.status)}
              </Badge>
            ) : null}
          </div>
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
            onClick={() => onRequestTour(listing, selectedSlot)}
          >
            <CalendarDays data-icon="inline-start" />
            {latestViewingRequest ? "调整看房时间" : "确认预约看房"}
          </Button>
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
        {items.map((item) => (
          <div key={item} className="flex gap-2 text-sm font-semibold text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-trust-green" aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrustScreen({
  queues,
  onToast
}: {
  queues: ApiTrustQueue[];
  onToast: (message: string) => void;
}) {
  return (
    <section className="app-shell grid w-full grid-cols-1 gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <TrustAndRoadmap />
      <OperationsPanel initialQueues={queues} onToast={onToast} />
    </section>
  );
}

function MarketToolbar({
  listingCount,
  viewMode,
  onViewModeChange,
  favoriteCount,
  dateRangeLabel,
  onOpenRoommates
}: {
  listingCount: number;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  favoriteCount: number;
  dateRangeLabel: string;
  onOpenRoommates: () => void;
}) {
  return (
    <Card className="shadow-panel">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Los Angeles 短租发现</h1>
          <p className="text-sm font-medium text-muted-foreground">
            {listingCount} 套可匹配房源 · {favoriteCount} 个收藏 · 主页专注找房
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
  selectedListing,
  onSelect
}: {
  className?: string;
  listings: Listing[];
  selectedListing: Listing;
  onSelect: (listing: Listing) => void;
}) {
  const mapListings = useMemo(() => listings.slice(0, 18), [listings]);
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
            <MapStat label="结果" value={`${mapSummary.count}`} />
            <MapStat label="最低" value={mapSummary.minimumPrice ? `$${mapSummary.minimumPrice.toLocaleString()}` : "--"} />
            <MapStat label="均价" value={mapSummary.averagePrice ? `$${mapSummary.averagePrice.toLocaleString()}` : "--"} />
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
                <Metric icon={BedDouble} label="卧室" value={`${selectedListing.beds} Bed`} />
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
        "group flex h-full scroll-mt-24 flex-col overflow-hidden rounded-[24px] border bg-white text-left shadow-[0_14px_50px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(0,106,255,0.14)]",
        selected ? "border-[#006AFF] ring-4 ring-[#006AFF]/10" : "border-blue-100"
      )}
    >
      <div className="relative">
        <button
          className="block aspect-[4/3] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]"
          style={{ backgroundImage: `url(${currentImage})` }}
          type="button"
          onClick={() => onPreview(listing)}
          aria-label={`在地图上选中 ${listing.title}`}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/38 via-transparent to-transparent" />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge className="border-white/60 bg-white/95 text-[#006AFF] shadow-sm">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Trust
          </Badge>
          {listing.tags.some((tag) => tag.includes("Group")) ? (
            <Badge className="border-emerald-100 bg-emerald-50 text-emerald-700 shadow-sm">Group Fit</Badge>
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
        <Button
          variant={selected ? "trust" : "outline"}
          className="mt-auto h-11 w-full justify-between font-black"
          onClick={() => onOpenListing(listing)}
        >
          {actionLabel}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </article>
  );
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

function EscrowPanel({
  listing,
  currentStep,
  onAdvance
}: {
  listing: Listing;
  currentStep: number;
  onAdvance: () => void;
}) {
  const steps: Array<{ code: string; label: string }> = [
    { code: "pending_payment", label: "待支付" },
    { code: "funds_held", label: "托管中" },
    { code: "confirmed", label: "已确认" },
    { code: "move_in_pending", label: "入住核销" },
    { code: "completed", label: "已完成" }
  ];

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>交易托管</CardTitle>
        <CardDescription>{listing.title} · Stripe Connect 模拟状态</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {steps.map(({ code, label }, index) => {
          const active = index <= currentStep;
          return (
          <div key={code} className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full border",
                active
                  ? "border-trust-green bg-trust-green text-white"
                  : "border-border bg-secondary text-muted-foreground"
              )}
            >
              {active ? (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              ) : (
                <Clock3 className="size-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-primary">{label}</div>
              <div className="truncate text-xs font-semibold text-muted-foreground">
                {code}
              </div>
            </div>
          </div>
          );
        })}
        <div className="rounded-md bg-secondary p-3 text-sm font-semibold text-primary">
          <div className="flex justify-between">
            <span>托管金额</span>
            <span>${listing.price.toLocaleString()}</span>
          </div>
          <div className="mt-2 flex justify-between text-muted-foreground">
            <span>平台服务费</span>
            <span>${Math.round(listing.price * 0.035)}</span>
          </div>
        </div>
        <Button variant="outline" className="w-full justify-between" onClick={onAdvance} disabled={currentStep >= steps.length - 1}>
          {currentStep >= steps.length - 1 ? "交易已完成" : "推进下一状态"}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

function PublishingFlow({
  isPublishing,
  onCreate
}: {
  isPublishing: boolean;
  onCreate: (draft: PublishDraft) => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<PublishDraft>({
    title: "新发布主卧短租",
    area: "Los Angeles · Westwood",
    price: 1580,
    beds: 1,
    baths: 1
  });
  const steps = [
    ["01", "基础信息", "地址、卧室、卫浴、租期"],
    ["02", "分类相册", "卧室、客厅、厨房/卫浴、周边"],
    ["03", "补贴净价", "原租金、首周减免、手净价"],
    ["04", "合同承诺", "房东知情、三方协议、审核"]
  ];

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>发布房源流程</CardTitle>
            <CardDescription>分类相册、净价补贴、房东知情承诺、发布审核</CardDescription>
          </div>
          <Button variant="trust" size="sm" onClick={() => onCreate(draft)} disabled={isPublishing}>
            <Building2 data-icon="inline-start" />
            {isPublishing ? "提交中" : "创建并提交"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {steps.map(([stepCode, title, detail], index) => (
            <button
              key={stepCode}
              className={cn(
                "rounded-md border bg-white p-4 text-left transition-colors",
                index === step && "border-trust-sky bg-trust-sky/5"
              )}
              type="button"
              onClick={() => setStep(index)}
            >
              <div className="text-xs font-extrabold text-trust-sky">{stepCode}</div>
              <div className="mt-2 text-sm font-bold text-primary">{title}</div>
              <div className="mt-1 text-sm font-medium text-muted-foreground">{detail}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-md border bg-white p-4 md:grid-cols-[minmax(0,1fr)_140px_90px_90px]">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            房源标题
            <Input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            区域
            <Input
              value={draft.area}
              onChange={(event) => setDraft({ ...draft, area: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            价格
            <Input
              type="number"
              value={draft.price}
              onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Bed
              <Input
                type="number"
                min="1"
                value={draft.beds}
                onChange={(event) => setDraft({ ...draft, beds: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Bath
              <Input
                type="number"
                min="1"
                value={draft.baths}
                onChange={(event) => setDraft({ ...draft, baths: Number(event.target.value) })}
              />
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrustAndRoadmap() {
  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>信任与三阶段前端范围</CardTitle>
        <CardDescription>P0/P1/P2 静态模块在同一设计系统下呈现</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            phase: "P0",
            title: "核心撮合与交易",
            color: "danger" as const,
            items: ["邮箱认证", "卡片流", "Group 创建", "地图找房", "基础托管"]
          },
          {
            phase: "P1",
            title: "风控与推荐",
            color: "warning" as const,
            items: ["整租推荐", "阶梯退款", "入住保障", "信用降权", "服务费"]
          },
          {
            phase: "P2",
            title: "租后高频生态",
            color: "success" as const,
            items: ["假期转租", "共享微仓", "拼单外卖", "水电拆分"]
          }
        ].map((phase) => (
          <div key={phase.phase} className="rounded-md border bg-white p-4">
            <Badge variant={phase.color}>{phase.phase}</Badge>
            <h3 className="mt-3 text-base font-bold text-primary">{phase.title}</h3>
            <div className="mt-4 flex flex-col gap-2">
              {phase.items.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="size-4 text-trust-green" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OperationsPanel({
  initialQueues,
  onToast
}: {
  initialQueues: ApiTrustQueue[];
  onToast: (message: string) => void;
}) {
  const fallbackQueues: QueueItem[] = [
    { label: "人工认证待审", value: 24, icon: UserCheck, variant: "trust" },
    { label: "房源媒体审核", value: 11, icon: Coffee, variant: "warning" },
    { label: "退款/缺陷工单", value: 3, icon: ShieldCheck, variant: "danger" },
    { label: "信用分重算队列", value: 128, icon: Sparkles, variant: "success" }
  ];
  const [queues, setQueues] = useState<QueueItem[]>(
    initialQueues.length > 0
      ? initialQueues.map((queue) => ({ ...queue, icon: ShieldCheck }))
      : fallbackQueues
  );

  useEffect(() => {
    if (initialQueues.length > 0) {
      setQueues(initialQueues.map((queue) => ({ ...queue, icon: ShieldCheck })));
    }
  }, [initialQueues]);

  function processQueue(label: string) {
    setQueues((current) =>
      current.map((queue) =>
        queue.label === label ? { ...queue, value: Math.max(0, queue.value - 1) } : queue
      )
    );
    onToast(`${label} 已处理 1 条`);
  }

  const reviewModules = [
    "举报入口",
    "内容审核",
    "退款介入",
    "信用降权",
    "入住保障",
    "服务费分账"
  ];

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>运营控制台预览</CardTitle>
        <CardDescription>审核、举报、信用分和应急保障的静态入口</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {queues.map(({ label, value, icon: Icon, variant }) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-md border bg-white p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div>
                <div className="text-sm font-bold text-primary">{label}</div>
                <div className="text-xs font-semibold text-muted-foreground">Admin queue</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={variant}>{value}</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => processQueue(label)}
                disabled={value === 0}
              >
                处理
              </Button>
            </div>
          </div>
        ))}
        <Separator />
        <div className="grid grid-cols-2 gap-2">
          {reviewModules.map((module) => (
            <Button
              key={module}
              variant="secondary"
              size="sm"
              className="justify-start"
              onClick={() => onToast(`${module} 已打开静态面板`)}
            >
              <MessageCircle data-icon="inline-start" />
              {module}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
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
